import { describe, it, expect, beforeEach } from 'vitest'

// Reset module state between tests
let checkRateLimit: typeof import('@/lib/rate-limit').checkRateLimit
let getClientIP: typeof import('@/lib/rate-limit').getClientIP

beforeEach(async () => {
  // Re-import to get a fresh module with empty store
  const mod = await import('@/lib/rate-limit')
  checkRateLimit = mod.checkRateLimit
  getClientIP = mod.getClientIP
})

describe('checkRateLimit', () => {
  it('allows requests under the limit', () => {
    const result = checkRateLimit('test-key', { max: 3, windowMs: 60_000 })
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(2)
  })

  it('blocks requests at the limit', () => {
    checkRateLimit('flood', { max: 2, windowMs: 60_000 })
    checkRateLimit('flood', { max: 2, windowMs: 60_000 })
    const result = checkRateLimit('flood', { max: 2, windowMs: 60_000 })
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.retryAfterMs).toBeGreaterThan(0)
  })

  it('tracks different keys independently', () => {
    checkRateLimit('user-a', { max: 1, windowMs: 60_000 })
    const resultA = checkRateLimit('user-a', { max: 1, windowMs: 60_000 })
    const resultB = checkRateLimit('user-b', { max: 1, windowMs: 60_000 })
    expect(resultA.allowed).toBe(false)
    expect(resultB.allowed).toBe(true)
  })

  it('returns correct remaining count', () => {
    const r1 = checkRateLimit('counter', { max: 3, windowMs: 60_000 })
    expect(r1.remaining).toBe(2)
    const r2 = checkRateLimit('counter', { max: 3, windowMs: 60_000 })
    expect(r2.remaining).toBe(1)
    const r3 = checkRateLimit('counter', { max: 3, windowMs: 60_000 })
    expect(r3.remaining).toBe(0)
  })
})

describe('getClientIP', () => {
  it('extracts IP from X-Forwarded-For header', () => {
    const headers = new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' })
    expect(getClientIP(headers)).toBe('1.2.3.4')
  })

  it('falls back to X-Real-IP', () => {
    const headers = new Headers({ 'x-real-ip': '10.0.0.1' })
    expect(getClientIP(headers)).toBe('10.0.0.1')
  })

  it('returns anonymous when no IP headers present', () => {
    const headers = new Headers()
    expect(getClientIP(headers)).toBe('anonymous')
  })
})
