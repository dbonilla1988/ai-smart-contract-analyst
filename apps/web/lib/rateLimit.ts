/**
 * In-memory sliding-window rate limiter.
 *
 * Deployment note: on multi-instance serverless (e.g. Vercel), each instance
 * keeps its own counters — this is not a globally distributed quota.
 */

export interface RateLimitConfig {
  /** Max requests in the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

interface Bucket {
  timestamps: number[];
}

const stores = new Map<string, Map<string, Bucket>>();

function getStore(namespace: string): Map<string, Bucket> {
  let store = stores.get(namespace);
  if (!store) {
    store = new Map();
    stores.set(namespace, store);
  }
  return store;
}

export function checkRateLimit(
  namespace: string,
  key: string,
  config: RateLimitConfig,
  now = Date.now(),
): RateLimitResult {
  const store = getStore(namespace);
  const bucket = store.get(key) ?? { timestamps: [] };
  const cutoff = now - config.windowMs;
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  if (bucket.timestamps.length >= config.limit) {
    store.set(key, bucket);
    const oldest = bucket.timestamps[0] ?? now;
    return {
      allowed: false,
      limit: config.limit,
      remaining: 0,
      resetAt: oldest + config.windowMs,
    };
  }

  bucket.timestamps.push(now);
  store.set(key, bucket);
  return {
    allowed: true,
    limit: config.limit,
    remaining: Math.max(0, config.limit - bucket.timestamps.length),
    resetAt: now + config.windowMs,
  };
}

/** Test helper — clears all in-memory rate-limit state. */
export function resetRateLimitStores(): void {
  stores.clear();
}

/** V1 defaults: deterministic is more permissive than AI-enabled. */
export const RATE_LIMITS = {
  deterministic: { limit: 30, windowMs: 60_000 } satisfies RateLimitConfig,
  ai: { limit: 5, windowMs: 60_000 } satisfies RateLimitConfig,
} as const;
