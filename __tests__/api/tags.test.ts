import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()
const mockSelect = vi.fn()
const mockOrder = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => {
      mockFrom(...args)
      return {
        select: (...a: unknown[]) => {
          mockSelect(...a)
          return {
            order: (...b: unknown[]) => {
              mockOrder(...b)
              return Promise.resolve({
                data: [
                  { id: '1', name: 'Agents', category: 'AI' },
                  { id: '2', name: 'LLM-Release', category: 'AI' },
                ],
                error: null,
              })
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

import { GET } from '@/app/api/tags/route'
import { NextRequest } from 'next/server'

function makeRequest() {
  return new NextRequest('http://localhost/api/tags')
}

describe('GET /api/tags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns tags from database', async () => {
    const res = await GET(makeRequest())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.data).toHaveLength(2)
    expect(json.data[0].name).toBe('Agents')
  })

  it('queries tech_tags table ordered by name', async () => {
    await GET(makeRequest())
    expect(mockFrom).toHaveBeenCalledWith('tech_tags')
    expect(mockSelect).toHaveBeenCalledWith('id, name, category')
    expect(mockOrder).toHaveBeenCalledWith('name')
  })

  it('has Cache-Control header for caching', async () => {
    const res = await GET(makeRequest())
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=300')
  })
})
