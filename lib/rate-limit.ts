/**
 * In-memory sliding-window rate limiter.
 *
 * Zero dependencies — suitable for single-instance deployments.
 * For multi-instance production, replace with @upstash/ratelimit + Redis.
 *
 * Each IP gets a window of `windowMs` milliseconds with at most `max` requests.
 * Old entries are pruned on every check to prevent memory leaks.
 */

interface RateLimitEntry {
  timestamps: number[]
}

const store = new Map<string, RateLimitEntry>()

// Prune expired entries every 60 seconds
const PRUNE_INTERVAL = 60_000
let lastPrune = Date.now()

function pruneExpired(windowMs: number): void {
  const now = Date.now()
  if (now - lastPrune < PRUNE_INTERVAL) return
  lastPrune = now

  const cutoff = now - windowMs
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff)
    if (entry.timestamps.length === 0) store.delete(key)
  }
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterMs: number
}

export function checkRateLimit(
  key: string,
  { max = 30, windowMs = 60_000 }: { max?: number; windowMs?: number } = {}
): RateLimitResult {
  pruneExpired(windowMs)

  const now = Date.now()
  const cutoff = now - windowMs

  let entry = store.get(key)
  if (!entry) {
    entry = { timestamps: [] }
    store.set(key, entry)
  }

  // Drop timestamps outside the current window
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff)

  if (entry.timestamps.length >= max) {
    const oldest = entry.timestamps[0]
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: oldest + windowMs - now,
    }
  }

  entry.timestamps.push(now)
  return {
    allowed: true,
    remaining: max - entry.timestamps.length,
    retryAfterMs: 0,
  }
}

/**
 * Extract a rate-limit key from a request.
 * Uses X-Forwarded-For (reverse proxy) → X-Real-IP → fallback 'anonymous'.
 */
export function getClientIP(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    'anonymous'
  )
}
