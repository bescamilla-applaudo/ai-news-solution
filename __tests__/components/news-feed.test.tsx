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

describe('NewsFeed', () => {
  it('shows loading skeletons initially', () => {
    // fetch never resolves
    ;(global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}))

    const { container } = renderWithQuery(<NewsFeed />)
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]')
    expect(skeletons.length).toBe(6)
  })

  it('renders articles after loading', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [makeArticle('1', 'First Article'), makeArticle('2', 'Second Article')],
        meta: { page: 0, hasMore: false },
      }),
    })

    renderWithQuery(<NewsFeed />)

    await waitFor(() => {
      expect(screen.getByText('First Article')).toBeInTheDocument()
      expect(screen.getByText('Second Article')).toBeInTheDocument()
    })
  })

  it('shows error message on fetch failure', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
    })

    renderWithQuery(<NewsFeed />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load articles. Please try again.')).toBeInTheDocument()
    })
  })

  it('shows empty state when no articles', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [],
        meta: { page: 0, hasMore: false },
      }),
    })

    renderWithQuery(<NewsFeed />)

    await waitFor(() => {
      expect(screen.getByText('No articles found.')).toBeInTheDocument()
    })
  })

  it('renders tag filter buttons', () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}))

    renderWithQuery(<NewsFeed />)
    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('RAG')).toBeInTheDocument()
    expect(screen.getByText('LLM-Release')).toBeInTheDocument()
    expect(screen.getByText('Dev-Tools')).toBeInTheDocument()
  })

  it('filters by tag when clicked', async () => {
    const user = userEvent.setup()
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [makeArticle('1', 'RAG Article')],
        meta: { page: 0, hasMore: false },
      }),
    })

    renderWithQuery(<NewsFeed />)

    await user.click(screen.getByText('RAG'))

    // Should call fetch with tag parameter
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      const lastCall = calls[calls.length - 1][0] as string
      expect(lastCall).toContain('tag=RAG')
    })
  })

  it('shows empty state with tag name when filtering', async () => {
    const user = userEvent.setup()
    let callCount = 0
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        // Initial "All" fetch
        return {
          ok: true,
          json: async () => ({
            data: [makeArticle('1', 'Some Article')],
            meta: { page: 0, hasMore: false },
          }),
        }
      }
      // Tag-filtered fetch returns empty
      return {
        ok: true,
        json: async () => ({
          data: [],
          meta: { page: 0, hasMore: false },
        }),
      }
    })

    renderWithQuery(<NewsFeed />)

    // Wait for initial articles to load
    await waitFor(() => {
      expect(screen.getByText('Some Article')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Agents'))

    await waitFor(() => {
      expect(screen.getByText('No articles found for tag "Agents".')).toBeInTheDocument()
    })
  })
})
