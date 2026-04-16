import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase before importing the route
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))
vi.mock('@/lib/guards', () => ({
  requireSupabase: vi.fn(() => null),
}))

// Stub env for embed URL
process.env.WORKER_EMBED_URL = 'http://test-embed:8001'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

import { GET } from '@/app/api/search/route'
import { supabase } from '@/lib/supabase'
import { NextRequest } from 'next/server'

function makeRequest(q?: string) {
  const url = q ? `http://localhost/api/search?q=${encodeURIComponent(q)}` : 'http://localhost/api/search'
  return new NextRequest(url)
}

describe('GET /api/search', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // Re-mock supabase after restoreAllMocks  
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ id: '1', title: 'Test', similarity: 0.95 }],
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    } as ReturnType<typeof supabase.rpc> extends Promise<infer R> ? R : never)
  })

  it('returns empty array when no query provided', async () => {
    const res = await GET(makeRequest())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.data).toEqual([])
  })

  it('returns empty array when query is too short', async () => {
    const res = await GET(makeRequest('a'))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.data).toEqual([])
  })

  it('returns 400 when query exceeds 200 chars', async () => {
    const longQuery = 'a'.repeat(201)
    const res = await GET(makeRequest(longQuery))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Query too long')
  })

  it('returns 503 when embed service is down', async () => {
    // Mock fetch to simulate embed service failure
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })

    const res = await GET(makeRequest('transformer models'))
    expect(res.status).toBe(503)
    const json = await res.json()
    expect(json.error).toBe('Embedding service unavailable')

    global.fetch = originalFetch
  })
})
