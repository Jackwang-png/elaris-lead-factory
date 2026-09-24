/**
 * T2.4/T2.6 — PaymentProviderRegistry.
 *
 * Central registry that manages all payment provider adapters.
 *
 * Routing rules (Design Freeze v1 + T2.6 resilience):
 *   - register() adds real channel providers (wechat / alipay / stripe).
 *   - get(name) returns the registered provider or UnknownPaymentProvider.
 *   - getByPriority() returns registered providers ordered by priority.
 *   - getActiveProviders() only returns providers with config.enabled === true.
 *   - findAvailableProvider() filter chain (T2.6):
 *       priority → enabled → health != DOWN → quota → maintenance
 *       → circuit canRequest → supports(feature) → first provider
 *     (quota/maintenance have no config source yet — skipped.)
 *   - CircuitBreaker is pure in-memory state decision; OPEN providers are
 *     skipped. Null/Unknown providers are fallbacks — they never join the
 *     priority-ordered routing set.
 */
import { Injectable } from '@nestjs/common';
import { PaymentProvider, ProviderConfig } from './payment-provider.interface';
import { PaymentFeature } from '../domain/payment.enums';
import { HealthStatus } from '../domain/payment.enums';
import { ProviderHealth } from '../domain/payment.types';
import { CircuitBreaker } from '../domain/payment.circuit-breaker';
import { NullPaymentProvider } from './null.provider';
import { UnknownPaymentProvider } from './unknown.provider';

/** Minimum safe default provider config (never read from DB / env / secrets). */
export function createDefaultProviderConfig<P extends string>(
  provider: P,
  priority: number,
): ProviderConfig & { readonly provider: P } {
  return {
    provider,
    environment: 'sandbox',
    enabled: false,
    priority,
    sandbox: true,
    timeoutMs: 10000,
    retry: {
      policy: 'CONFIGURABLE',
      maxAttempts: 3,
      baseDelayMs: 500,
      maxDelayMs: 8000,
      jitter: true,
    },
    circuitBreaker: {
      threshold: 5,
      openMs: 60000,
    },
    webhook: {
      url: '',
      secretEnv: '',
    },
  };
}

export interface PaymentProviderRegistryOptions {
  readonly nullProvider?: PaymentProvider;
  readonly unknownProvider?: PaymentProvider;
  /** Optional health snapshot source; provider is skipped when status === DOWN. */
  readonly healthProvider?: (providerName: string) => ProviderHealth | undefined;
}

@Injectable()
export class PaymentProviderRegistry {
  private readonly providers = new Map<string, PaymentProvider>();
  private readonly nullProvider: PaymentProvider;
  private readonly unknownProvider: PaymentProvider;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly healthProvider?: (providerName: string) => ProviderHealth | undefined;

  constructor(options?: PaymentProviderRegistryOptions) {
    this.nullProvider =
      options?.nullProvider ??
      new NullPaymentProvider(createDefaultProviderConfig('null', 0));
    this.unknownProvider =
      options?.unknownProvider ??
      new UnknownPaymentProvider(createDefaultProviderConfig('unknown', 0));
    this.circuitBreaker = new CircuitBreaker();
    this.healthProvider = options?.healthProvider;
  }

  /** Register a real channel provider. Null/Unknown must NOT be registered here. */
  register(provider: PaymentProvider): void {
    this.providers.set(provider.name, provider);
    this.circuitBreaker.configure(provider.name, provider.config.circuitBreaker);
  }

  /**
   * Resolve a provider by key. Falls back to UnknownPaymentProvider
   * when the key is not registered.
   */
  get(name: string): PaymentProvider {
    return this.providers.get(name) ?? this.unknownProvider;
  }

  /** Registered providers ordered by priority (highest first). */
  getByPriority(): PaymentProvider[] {
    return [...this.providers.values()].sort(
      (a, b) => (b.config.priority ?? 0) - (a.config.priority ?? 0),
    );
  }

  /** Only providers with config.enabled === true participate in routing. */
  getActiveProviders(): PaymentProvider[] {
    return this.getByPriority().filter((p) => p.config.enabled === true);
  }

  /**
   * Pick the top-priority available provider.
   *
   * T2.6 filter chain:
   *   priority → enabled → health != DOWN → quota → maintenance
   *   → circuit canRequest → supports(feature) → first provider
   *
   * quota / maintenance have no config source yet and are skipped.
   * Returns NullPaymentProvider when no provider is available.
   * `exclude` (T2.7) lets the execution boundary skip already-attempted
   * providers during failover without bypassing the registry.
   */
  findAvailableProvider(
    feature?: PaymentFeature,
    exclude?: ReadonlySet<string>,
  ): PaymentProvider {
    const available = this.getActiveProviders().filter((provider) => {
      if (exclude?.has(provider.name)) {
        return false;
      }
      // health != DOWN (only when a health snapshot source is provided)
      if (this.healthProvider) {
        const health = this.healthProvider(provider.name);
        if (health && health.status === HealthStatus.DOWN) {
          return false;
        }
      }
      // circuit: OPEN providers are skipped
      if (!this.circuitBreaker.canRequest(provider.name)) {
        return false;
      }
      // supports(feature)
      if (feature !== undefined && !provider.supports(feature)) {
        return false;
      }
      return true;
    });
    return available[0] ?? this.nullProvider;
  }

  /** Default channel = top-priority available provider, or Null fallback. */
  getDefault(): PaymentProvider {
    return this.findAvailableProvider();
  }

  /** Registered provider keys (real channels only). */
  getRegistered(): string[] {
    return [...this.providers.keys()];
  }

  /** True when the provider is the Null fallback (no real channel). */
  isNullProvider(provider: PaymentProvider): boolean {
    return provider === this.nullProvider;
  }

  /** Expose the in-memory circuit breaker (state decisions only). */
  getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }
}
