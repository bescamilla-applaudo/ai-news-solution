import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock chain for email_subscriptions
const subscriptionChain: Record<string, ReturnType<typeof vi.fn>> = {
  upsert: vi.fn(() => Promise.resolve({ error: null })),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(() =>
    Promise.resolve({ data: { email: 'test@example.com', active: true }, error: null })
  ),
}
// Chain select → eq → maybeSingle
subscriptionChain.select.mockReturnValue(subscriptionChain)
subscriptionChain.eq.mockReturnValue(subscriptionChain)

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

import { GET, POST } from '@/app/api/email-subscribe/route'
import { NextRequest } from 'next/server'

function makePostRequest(body?: unknown) {
  return new NextRequest('http://localhost/api/email-subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : 'not-json',
  })
}

beforeEach(() => {
  subscriptionChain.upsert.mockClear()
  subscriptionChain.select.mockClear().mockReturnValue(subscriptionChain)
  subscriptionChain.eq.mockClear().mockReturnValue(subscriptionChain)
  subscriptionChain.maybeSingle.mockClear().mockReturnValue(
    Promise.resolve({ data: { email: 'test@example.com', active: true }, error: null })
  )
})

describe('GET /api/email-subscribe', () => {
  it('returns subscription status', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toEqual({ email: 'test@example.com', active: true })
  })

  it('includes no-store Cache-Control', async () => {
    const res = await GET()
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('POST /api/email-subscribe', () => {
  it('returns 400 for invalid JSON', async () => {
    const req = new NextRequest('http://localhost/api/email-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/Invalid JSON/)
  })

  it('returns 400 when email is missing', async () => {
    const res = await POST(makePostRequest({}))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/email/)
  })

  it('returns 400 for invalid email format', async () => {
    const res = await POST(makePostRequest({ email: 'not-an-email' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/Invalid email/)
  })

  it('returns 400 for email exceeding max length', async () => {
    const longEmail = 'a'.repeat(250) + '@b.com'
    const res = await POST(makePostRequest({ email: longEmail }))
    expect(res.status).toBe(400)
  })

  it('subscribes successfully with valid email', async () => {
    const res = await POST(makePostRequest({ email: 'dev@example.com' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.message).toMatch(/Subscribed/)
  })

  it('calls supabase upsert with correct data', async () => {
    await POST(makePostRequest({ email: 'Dev@Example.COM' }))
    expect(subscriptionChain.upsert).toHaveBeenCalledWith(
      { user_id: 'owner', email: 'dev@example.com', active: true },
      { onConflict: 'user_id' }
    )
  })

  it('trims and lowercases email', async () => {
    await POST(makePostRequest({ email: '  Test@EXAMPLE.com  ' }))
    expect(subscriptionChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'test@example.com' }),
      expect.anything()
    )
  })

  it('returns 400 for non-string email', async () => {
    const res = await POST(makePostRequest({ email: 123 }))
    expect(res.status).toBe(400)
  })
})
