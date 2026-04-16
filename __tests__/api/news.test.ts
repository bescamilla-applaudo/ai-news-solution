import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockOrder = vi.fn()
const mockRange = vi.fn()
const mockContains = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => {
      mockFrom(...args)
      return {
        select: (...a: unknown[]) => {
          mockSelect(...a)
          return {
            eq: (...b: unknown[]) => {
              mockEq(...b)
              return {
                eq: (...c: unknown[]) => {
                  mockEq(...c)
                  return {
                    order: (...d: unknown[]) => {
                      mockOrder(...d)
                      return {
                        order: (...e: unknown[]) => {
                          mockOrder(...e)
                          return {
                            range: (...f: unknown[]) => {
                              mockRange(...f)
                              return {
                                contains: (...g: unknown[]) => {
                                  mockContains(...g)
                                  return Promise.resolve({ data: [], error: null, count: 0 })
                                },
                                then: (resolve: (v: unknown) => void) =>
                                  resolve({ data: [{ id: '1', title: 'Test Article' }], error: null, count: 1 }),
                              }
                            },
                          }
                        },
                      }
                    },
                  }
                },
              }
            },
          }
        },
      }
    },
  },
}))
vi.mock('@/lib/guards', () => ({
  requireSupabase: vi.fn(() => null),
}))

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

import { GET } from '@/app/api/news/route'
import { NextRequest } from 'next/server'

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/news')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url)
}

describe('GET /api/news', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns articles with pagination metadata', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toBeDefined()
    expect(json.meta).toBeDefined()
    expect(json.meta.page).toBe(0)
    expect(json.meta.pageSize).toBe(20)
  })

  it('includes Cache-Control header', async () => {
    const res = await GET(makeRequest())
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=60')
  })

  it('clamps negative page to 0', async () => {
    const res = await GET(makeRequest({ page: '-5' }))
    const json = await res.json()
    expect(json.meta.page).toBe(0)
  })
})
