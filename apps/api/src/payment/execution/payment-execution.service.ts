/**
 * T2.7 — PaymentExecutionService (Provider-independent execution boundary).
 *
 * PaymentService expresses business intent (CREATE_ORDER / REFUND / ...)
 * and delegates ALL infrastructure concerns here:
 *
 *   provider selection  → PaymentProviderRegistry.findAvailableProvider()
 *   circuit check       → registry.getCircuitBreaker().canRequest()
 *   provider operation  → options.operation(provider, attempt)
 *   error mapping       → only PaymentError escapes this boundary
 *   retry decision      → isRetryableError() from domain/payment.policy.ts
 *   idempotency         → same key across retries; scope tenant+op+key
 *   failover            → only after retry exhausted, never on
 *                         BUSINESS_ERROR / UNKNOWN_SIDE_EFFECT
 *
 * NO provider-specific branch (no `if provider === 'wechat'`), no SDK,
 * no HTTP, no sleep. Retry DELAY is calculated (calculateRetryDelay) but
 * sleeping is left to the caller (T2.7 computes, does not sleep).
 */
import { Injectable } from '@nestjs/common';
import { PaymentError, PaymentErrorCode } from '../domain/payment.errors';
import {
  DEFAULT_RETRY_POLICY_CONFIG,
  isRetryableError,
  RetryPolicyConfig,
} from '../domain/payment.policy';
import {
  PaymentProvider,
} from '../providers/payment-provider.interface';
import { PaymentProviderRegistry } from '../providers/payment-provider.registry';
import {
  getRetrySafety,
  PaymentExecutionAttempt,
  PaymentExecutionOptions,
  PaymentOperation,
} from './payment-execution.types';

@Injectable()
export class PaymentExecutionService {
  constructor(private readonly registry: PaymentProviderRegistry) {}

  /**
   * Execute a provider operation under the execution boundary.
   * Only PaymentError escapes — provider SDK errors are wrapped.
   */
  async execute<T>(
    operation: PaymentOperation,
    options: PaymentExecutionOptions<T>,
  ): Promise<T> {
    const safety = getRetrySafety(operation);

    // Idempotency gate: CREATE_ORDER / REFUND without a key must not
    // auto-retry; refuse loudly instead of risking a duplicate side effect.
    if (safety.idempotencyRequired && !options.idempotencyKey) {
      throw new PaymentError(
        `operation ${operation} requires idempotency key for retry`,
        {
          code: PaymentErrorCode.FATAL_ERROR,
          provider: options.providerName ?? 'unknown',
          retryable: false,
        },
      );
    }

    const retryConfig = options.retryConfig ?? DEFAULT_RETRY_POLICY_CONFIG;
    const circuit = this.registry.getCircuitBreaker();
    const attemptedProviders = new Set<string>();
    let attempt = 0;

    while (true) {
      const provider = await this.selectProvider(operation, options, attemptedProviders);
      // No real channel available — never execute the Null fallback.
      if (this.registry.isNullProvider(provider)) {
        throw new PaymentError('no available payment provider', {
          code: PaymentErrorCode.PROVIDER_NOT_AVAILABLE,
          provider: options.providerName ?? 'unknown',
          retryable: false,
        });
      }
      const providerName = provider.name;

      // Circuit check before each provider attempt.
      if (!circuit.canRequest(providerName)) {
        attemptedProviders.add(providerName);
        if (attemptedProviders.size >= this.registry.getActiveProviders().length) {
          throw new PaymentError('no available payment provider', {
            code: PaymentErrorCode.PROVIDER_NOT_AVAILABLE,
            provider: options.providerName ?? 'unknown',
            retryable: false,
          });
        }
        continue; // try next provider (OPEN is skipped)
      }

      const attemptCtx: PaymentExecutionAttempt = {
        attempt,
        operation,
        providerName,
        idempotencyKey: options.idempotencyKey, // SAME key across retries
      };

      try {
        const result = await options.operation(provider, attemptCtx);
        circuit.recordSuccess(providerName);
        return result;
      } catch (err) {
        const paymentError = this.toPaymentError(err, providerName);
        circuit.recordFailure(providerName, paymentError);

        // Retry decision (same provider, same idempotency key).
        // `attempt + 1` = attempts already made, so maxAttempts bounds the
        // TOTAL number of attempts (1 try + maxAttempts-1 retries).
        if (this.shouldRetry(operation, paymentError, retryConfig, attempt + 1)) {
          attempt += 1;
          continue;
        }

        // Failover decision (new provider via registry only).
        if (this.shouldFailover(operation, paymentError)) {
          attemptedProviders.add(providerName);
          if (attemptedProviders.size < this.registry.getActiveProviders().length) {
            attempt = 0;
            continue; // re-select with exclusions
          }
        }

        throw paymentError;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Provider selection                                                  */
  /* ------------------------------------------------------------------ */

  private async selectProvider<T>(
    operation: PaymentOperation,
    options: PaymentExecutionOptions<T>,
    excluded: ReadonlySet<string>,
  ): Promise<PaymentProvider> {
    if (options.providerName) {
      return this.registry.get(options.providerName);
    }
    return this.registry.findAvailableProvider(options.feature, excluded);
  }

  /* ------------------------------------------------------------------ */
  /* Retry / failover decisions                                          */
  /* ------------------------------------------------------------------ */

  private shouldRetry<T>(
    operation: PaymentOperation,
    error: PaymentError,
    retryConfig: RetryPolicyConfig,
    attempt: number,
  ): boolean {
    // Retry Safety Matrix: CLOSE_ORDER / VERIFY_WEBHOOK never auto-retry.
    if (getRetrySafety(operation).retry === 'never') {
      return false;
    }
    // Unknown side effect: never auto-retry (may double-charge).
    if (error.code === PaymentErrorCode.UNKNOWN_SIDE_EFFECT) {
      return false;
    }
    // Business / fatal errors are never retried inside the boundary.
    if (
      error.code === PaymentErrorCode.BUSINESS_ERROR ||
      error.code === PaymentErrorCode.FATAL_ERROR
    ) {
      return false;
    }
    return isRetryableError(error, retryConfig, attempt);
  }

  private shouldFailover<T>(
    operation: PaymentOperation,
    error: PaymentError,
  ): boolean {
    // CLOSE_ORDER / VERIFY_WEBHOOK: no automatic failover.
    if (
      operation === PaymentOperation.CLOSE_ORDER ||
      operation === PaymentOperation.VERIFY_WEBHOOK
    ) {
      return false;
    }
    // Business rejections must not silently switch providers.
    if (error.code === PaymentErrorCode.BUSINESS_ERROR) {
      return false;
    }
    // Unknown side effect (e.g. createOrder timeout): the provider may have
    // succeeded — never blindly create a second payment / refund elsewhere.
    if (error.code === PaymentErrorCode.UNKNOWN_SIDE_EFFECT) {
      return false;
    }
    // Fatal errors are not failover candidates.
    if (error.code === PaymentErrorCode.FATAL_ERROR) {
      return false;
    }
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Error boundary                                                      */
  /* ------------------------------------------------------------------ */

  private toPaymentError(err: unknown, providerName: string): PaymentError {
    if (err instanceof PaymentError) {
      return err;
    }
    const message = err instanceof Error ? err.message : 'unknown provider error';
    // Wrap any provider SDK / HTTP error into a domain PaymentError so
    // PaymentService only ever sees PaymentErrorCode.
    return new PaymentError(message, {
      code: PaymentErrorCode.PROVIDER_ERROR,
      provider: providerName,
      retryable: false,
      cause: err,
    });
  }
}
