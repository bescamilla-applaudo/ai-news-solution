import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NewsFeed } from '@/components/news-feed'

// Mock next/link
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

function makeArticle(id: string, title: string) {
  return {
    id,
    source_url: `https://example.com/${id}`,
    source_name: 'arxiv',
    title,
    raw_content: 'content',
    technical_summary: 'summary',
    impact_score: 7,
    depth_score: 6,
    implementation_steps: [],
    affected_workflows: [],
    embedding: null,
    category: 'Technical',
    tags: [],
    published_at: new Date().toISOString(),
    is_filtered: true,
    created_at: new Date().toISOString(),
    news_item_tags: [],
  }
}

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  global.fetch = vi.fn()
})

// Mock response for /api/tags — returns fallback-compatible tag list
const tagsResponse = {
  ok: true,
  json: async () => ({
    data: [
      { id: '1', name: 'Agents', category: 'AI' },
      { id: '2', name: 'Dev-Tools', category: 'AI' },
      { id: '3', name: 'LLM-Release', category: 'AI' },
      { id: '4', name: 'RAG', category: 'AI' },
    ],
  }),
}

/** Wrap a fetch mock so /api/tags always returns tags, other calls use the provided mock */
function mockFetchWith(newsMock: (input: string | URL | Request, ...args: unknown[]) => unknown) {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
    (input: string | URL | Request, ...args: unknown[]) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('/api/tags')) return Promise.resolve(tagsResponse)
      return newsMock(input, ...args)
    }
  )
}

describe('NewsFeed', () => {
  it('shows loading skeletons initially', () => {
    // news fetch never resolves
    mockFetchWith(vi.fn().mockReturnValue(new Promise(() => {})))

    const { container } = renderWithQuery(<NewsFeed />)
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]')
    expect(skeletons.length).toBe(6)
  })

  it('renders articles after loading', async () => {
    mockFetchWith(vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [makeArticle('1', 'First Article'), makeArticle('2', 'Second Article')],
        meta: { page: 0, hasMore: false },
      }),
    }))

    renderWithQuery(<NewsFeed />)

    await waitFor(() => {
      expect(screen.getByText('First Article')).toBeInTheDocument()
      expect(screen.getByText('Second Article')).toBeInTheDocument()
    })
  })

  it('shows error message on fetch failure', async () => {
    mockFetchWith(vi.fn().mockResolvedValue({ ok: false }))

    renderWithQuery(<NewsFeed />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load articles. Please try again.')).toBeInTheDocument()
    })
  })

  it('shows empty state when no articles', async () => {
    mockFetchWith(vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [],
        meta: { page: 0, hasMore: false },
      }),
    }))

    renderWithQuery(<NewsFeed />)

    await waitFor(() => {
      expect(screen.getByText('No articles found.')).toBeInTheDocument()
    })
  })

  it('renders tag filter buttons', () => {
    mockFetchWith(vi.fn().mockReturnValue(new Promise(() => {})))

    renderWithQuery(<NewsFeed />)
    expect(screen.getByText('All')).toBeInTheDocument()
  })

  it('filters by tag when clicked', async () => {
    const user = userEvent.setup()
    const newsMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [makeArticle('1', 'RAG Article')],
        meta: { page: 0, hasMore: false },
      }),
    })
    mockFetchWith(newsMock)

    renderWithQuery(<NewsFeed />)

    // Wait for tags to load, then click RAG
    await waitFor(() => {
      expect(screen.getByText('RAG')).toBeInTheDocument()
    })
    await user.click(screen.getByText('RAG'))

    // Should call fetch with tag parameter
    await waitFor(() => {
      const calls = newsMock.mock.calls
      const lastCall = calls[calls.length - 1][0] as string
      expect(lastCall).toContain('tag=RAG')
    })
  })

  it('shows empty state with tag name when filtering', async () => {
    const user = userEvent.setup()
    let callCount = 0
    const newsMock = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return {
          ok: true,
          json: async () => ({
            data: [makeArticle('1', 'Some Article')],
            meta: { page: 0, hasMore: false },
          }),
        }
      }
      return {
        ok: true,
        json: async () => ({
          data: [],
          meta: { page: 0, hasMore: false },
        }),
      }
    })
    mockFetchWith(newsMock)

    renderWithQuery(<NewsFeed />)

    await waitFor(() => {
      expect(screen.getByText('Some Article')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByText('Agents')).toBeInTheDocument()
    })
    await user.click(screen.getByText('Agents'))

    await waitFor(() => {
      expect(screen.getByText('No articles found for tag "Agents".')).toBeInTheDocument()
    })
  })
})
