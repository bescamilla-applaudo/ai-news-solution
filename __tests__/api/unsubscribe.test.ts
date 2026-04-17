import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'

// Mock chain for email_subscriptions
function makeChain() {
  const chain: Record<string, unknown> = {}
  chain.update = vi.fn(() => chain)
  chain.eq = vi.fn(() => Promise.resolve({ error: null }))
  return chain
}

const subscriptionChain = makeChain()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => subscriptionChain),
  },
}))
vi.mock('@/lib/guards', () => ({
  requireSupabase: vi.fn(() => null),
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, retryAfterMs: 0 })),
  getClientIP: vi.fn(() => '127.0.0.1'),
}))

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
process.env.HMAC_SECRET = 'test-secret'

import { GET } from '@/app/api/unsubscribe/route'
import { NextRequest } from 'next/server'

function generateToken(uid: string, secret = 'test-secret'): string {
  return createHmac('sha256', secret).update(uid).digest('hex')
}

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/unsubscribe')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url)
}

beforeEach(() => {
  vi.clearAllMocks()
  // Reset the chain mock
  subscriptionChain.update = vi.fn(() => subscriptionChain)
  subscriptionChain.eq = vi.fn(() => Promise.resolve({ error: null }))
})

describe('GET /api/unsubscribe', () => {
  it('returns 400 when uid is missing', async () => {
    const res = await GET(makeRequest({ token: 'abc' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/Missing/)
  })

  it('returns 400 when token is missing', async () => {
    const res = await GET(makeRequest({ uid: 'owner' }))
    expect(res.status).toBe(400)
  })

  it('returns 403 for invalid HMAC token', async () => {
    const res = await GET(makeRequest({ uid: 'owner', token: 'a'.repeat(64) }))
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toMatch(/Invalid/)
  })

  it('returns 200 HTML page for valid token', async () => {
    const token = generateToken('owner')
    const res = await GET(makeRequest({ uid: 'owner', token }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('Unsubscribed successfully')
  })

  it('calls supabase update with active=false', async () => {
    const token = generateToken('owner')
    await GET(makeRequest({ uid: 'owner', token }))
    expect(subscriptionChain.update).toHaveBeenCalledWith({ active: false })
    expect(subscriptionChain.eq).toHaveBeenCalledWith('user_id', 'owner')
  })

  it('includes no-store Cache-Control', async () => {
    const token = generateToken('owner')
    const res = await GET(makeRequest({ uid: 'owner', token }))
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('returns 400 for oversized uid', async () => {
    const res = await GET(makeRequest({ uid: 'a'.repeat(101), token: 'abc' }))
    expect(res.status).toBe(400)
  })
})
