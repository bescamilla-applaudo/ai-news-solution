import { describe, it, expect, vi } from 'vitest'

// Build a chain mock for Supabase
function makeChain(terminalResult: unknown) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.single = vi.fn(() => Promise.resolve(terminalResult))
  chain.upsert = vi.fn(() => Promise.resolve({ error: null }))
  chain.delete = vi.fn(() => chain)
  return chain
}

const watchlistChain = makeChain({ data: [], error: null })
const tagChain = makeChain({ data: { id: 'tag-1' }, error: null })

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'tech_tags') return tagChain
      return watchlistChain
    }),
  },
}))
vi.mock('@/lib/guards', () => ({
  requireSupabase: vi.fn(() => null),
}))

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

import { GET, POST, DELETE } from '@/app/api/watchlist/route'
import { NextRequest } from 'next/server'

function makeRequest(method: string, body?: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/watchlist', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('GET /api/watchlist', () => {
  it('returns watchlist data', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('data')
  })

  it('includes no-store Cache-Control', async () => {
    const res = await GET()
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('POST /api/watchlist', () => {
  it('returns 400 for missing tech_tag_id', async () => {
    const res = await POST(makeRequest('POST', {}))
    expect(res.status).toBe(400)
  })

  it('returns 400 for non-string tech_tag_id', async () => {
    const res = await POST(makeRequest('POST', { tech_tag_id: 123 }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid JSON', async () => {
    const req = new NextRequest('http://localhost/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/watchlist', () => {
  it('returns 400 for missing tech_tag_id', async () => {
    const res = await DELETE(makeRequest('DELETE', {}))
    expect(res.status).toBe(400)
  })
})
