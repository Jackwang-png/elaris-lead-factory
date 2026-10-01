/**
 * Hunter Search Discovery V1 — Search Provider configuration (env-driven, fail-closed).
 *
 * The business kernel never sees these values; only SearchProvider consumes them,
 * and only through the generic HTTP adapter (no product/protocol leakage upstream).
 *
 * Env contract (all optional; the provider fails closed when SEARCH_PROVIDER_API_KEY
 * is absent):
 *   SEARCH_PROVIDER_API_KEY    required for the provider to be usable.
 *   SEARCH_PROVIDER_ENDPOINT   JSON search API endpoint (default Serper).
 *   SEARCH_PROVIDER_NAME       provider/source label used as candidate.source.
 *   SEARCH_PROVIDER_TIMEOUT_MS request timeout (default 5000).
 *
 * IMPORTANT: this object holds the secret in memory only. It is NEVER serialized,
 * logged, or written to disk.
 */

export class SearchProviderConfig {
  constructor(
    readonly apiKey: string | undefined,
    readonly endpoint: string,
    readonly name: string,
    readonly timeoutMs: number,
  ) {}
}

type Env = Record<string, string | undefined>;

function str(env: Env, key: string, fallback: string): string {
  const v = env[key];
  return v && v.trim() !== '' ? v.trim() : fallback;
}

function num(env: Env, key: string, fallback: number): number {
  const v = env[key];
  if (!v || v.trim() === '') return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadSearchProviderConfig(env: Env): SearchProviderConfig {
  return new SearchProviderConfig(
    env.SEARCH_PROVIDER_API_KEY || undefined,
    str(env, 'SEARCH_PROVIDER_ENDPOINT', 'https://google.serper.dev/search'),
    str(env, 'SEARCH_PROVIDER_NAME', 'serper'),
    num(env, 'SEARCH_PROVIDER_TIMEOUT_MS', 5000),
  );
}
