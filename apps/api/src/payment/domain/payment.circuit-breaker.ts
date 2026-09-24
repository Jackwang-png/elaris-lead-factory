/**
 * T2.6 — Circuit Breaker (Domain, provider-independent, pure in-memory).
 *
 * State decision ONLY. Never calls a provider, never sends HTTP/SDK
 * requests, no Redis, no Database.
 *
 * States: CLOSED → OPEN → HALF_OPEN
 *
 *   CLOSED   — normal operation; consecutive failures >= threshold → OPEN
 *   OPEN     — canRequest() = false; after openMs → HALF_OPEN (one probe)
 *   HALF_OPEN— exactly one probe request allowed (probeInFlight);
 *              success → CLOSED (failureCount = 0);
 *              failure → OPEN (fresh open timer)
 */
import { PaymentError, PaymentErrorCode } from './payment.errors';
import { ProviderCircuitBreakerConfig } from './payment.types';

/** Frozen circuit state. */
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

const DEFAULT_THRESHOLD = 5;
const DEFAULT_OPEN_MS = 60000;

interface CircuitEntry {
  state: CircuitState;
  failureCount: number;
  openedAt: number;
  probeInFlight: boolean;
}

/**
 * Provider infrastructure failures only affect the circuit.
 * BUSINESS / FATAL / PROVIDER_NOT_AVAILABLE errors do NOT count.
 */
export function isCircuitFailure(error: PaymentError): boolean {
  switch (error.code) {
    case PaymentErrorCode.NETWORK_ERROR:
    case PaymentErrorCode.PROVIDER_ERROR:
    case PaymentErrorCode.RETRYABLE_ERROR:
      return true;
    default:
      return false;
  }
}

export class CircuitBreaker {
  private readonly entries = new Map<string, CircuitEntry>();
  private readonly configs = new Map<string, ProviderCircuitBreakerConfig>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  private getEntry(providerName: string): CircuitEntry {
    let entry = this.entries.get(providerName);
    if (!entry) {
      entry = { state: CircuitState.CLOSED, failureCount: 0, openedAt: 0, probeInFlight: false };
      this.entries.set(providerName, entry);
    }
    return entry;
  }

  private threshold(providerName: string): number {
    return this.configs.get(providerName)?.threshold ?? DEFAULT_THRESHOLD;
  }

  private openMs(providerName: string): number {
    return this.configs.get(providerName)?.openMs ?? DEFAULT_OPEN_MS;
  }

  /**
   * Register/update circuit config for a provider (threshold / openMs).
   * Falls back to defaults when no config is provided.
   */
  configure(providerName: string, config?: ProviderCircuitBreakerConfig): void {
    if (config) {
      this.configs.set(providerName, config);
    }
  }

  /**
   * Whether a request may be sent to the provider.
   * OPEN → false until openMs elapses, then HALF_OPEN with one probe slot.
   * HALF_OPEN → one probe at a time (probeInFlight).
   */
  canRequest(providerName: string): boolean {
    const entry = this.getEntry(providerName);
    if (entry.state === CircuitState.CLOSED) {
      return true;
    }
    if (entry.state === CircuitState.OPEN) {
      if (this.now() - entry.openedAt >= this.openMs(providerName)) {
        entry.state = CircuitState.HALF_OPEN;
        entry.probeInFlight = true; // this request IS the probe
        return true;
      }
      return false;
    }
    // HALF_OPEN
    if (entry.probeInFlight) {
      return false; // a probe is already in flight
    }
    entry.probeInFlight = true;
    return true;
  }

  /** Record a successful call. HALF_OPEN → CLOSED; failureCount resets. */
  recordSuccess(providerName: string): void {
    const entry = this.getEntry(providerName);
    entry.state = CircuitState.CLOSED;
    entry.failureCount = 0;
    entry.probeInFlight = false;
  }

  /**
   * Record a failed call. Only circuit-classified failures count
   * (NETWORK_ERROR / PROVIDER_ERROR / RETRYABLE_ERROR).
   * HALF_OPEN failure → OPEN (fresh timer).
   */
  recordFailure(providerName: string, error?: PaymentError): void {
    if (error && !isCircuitFailure(error)) {
      return; // business/fatal/not-available errors do not trip the circuit
    }
    const entry = this.getEntry(providerName);
    entry.probeInFlight = false;
    if (entry.state === CircuitState.HALF_OPEN) {
      entry.state = CircuitState.OPEN;
      entry.openedAt = this.now();
      return;
    }
    entry.failureCount += 1;
    if (entry.failureCount >= this.threshold(providerName)) {
      entry.state = CircuitState.OPEN;
      entry.openedAt = this.now();
    }
  }

  getState(providerName: string): CircuitState {
    return this.getEntry(providerName).state;
  }

  getFailureCount(providerName: string): number {
    return this.getEntry(providerName).failureCount;
  }

  /** Reset a provider back to CLOSED (state + counters + config). */
  reset(providerName: string): void {
    this.entries.delete(providerName);
    this.configs.delete(providerName);
  }
}
