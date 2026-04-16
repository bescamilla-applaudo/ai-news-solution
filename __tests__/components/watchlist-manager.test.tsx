import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WatchlistManager } from '@/components/watchlist-manager'
import { TechTag } from '@/lib/database.types'

// Mock next/navigation
const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

const TAGS: TechTag[] = [
  { id: 't1', name: 'RAG', category: 'AI' },
  { id: 't2', name: 'LLM-Release', category: 'AI' },
  { id: 't3', name: 'Dev-Tools', category: 'Tools' },
]

beforeEach(() => {
  vi.restoreAllMocks()
  mockRefresh.mockReset()
  global.fetch = vi.fn()
})

describe('WatchlistManager', () => {
  it('renders all tags', () => {
    render(<WatchlistManager allTags={TAGS} watchedTagIds={[]} />)
    expect(screen.getByText('RAG')).toBeInTheDocument()
    expect(screen.getByText('LLM-Release')).toBeInTheDocument()
    expect(screen.getByText('Dev-Tools')).toBeInTheDocument()
  })

  it('shows watched count', () => {
    render(<WatchlistManager allTags={TAGS} watchedTagIds={['t1', 't2']} />)
    expect(screen.getByText('2 tags watched')).toBeInTheDocument()
  })

  it('shows singular form for 1 tag', () => {
    render(<WatchlistManager allTags={TAGS} watchedTagIds={['t1']} />)
    expect(screen.getByText('1 tag watched')).toBeInTheDocument()
  })

  it('toggles tag on (optimistic POST)', async () => {
    const user = userEvent.setup()
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true })

    render(<WatchlistManager allTags={TAGS} watchedTagIds={[]} />)
    await user.click(screen.getByText('RAG'))

    expect(global.fetch).toHaveBeenCalledWith('/api/watchlist', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ tech_tag_id: 't1' }),
    }))

    await waitFor(() => {
      expect(screen.getByText('1 tag watched')).toBeInTheDocument()
    })
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('toggles tag off (optimistic DELETE)', async () => {
    const user = userEvent.setup()
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true })

    render(<WatchlistManager allTags={TAGS} watchedTagIds={['t1']} />)
    await user.click(screen.getByText('RAG'))

    expect(global.fetch).toHaveBeenCalledWith('/api/watchlist', expect.objectContaining({
      method: 'DELETE',
    }))

    await waitFor(() => {
      expect(screen.getByText('0 tags watched')).toBeInTheDocument()
    })
  })

  it('rolls back on API failure', async () => {
    const user = userEvent.setup()
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false })

    render(<WatchlistManager allTags={TAGS} watchedTagIds={[]} />)
    await user.click(screen.getByText('RAG'))

    await waitFor(() => {
      expect(screen.getByText('Failed to update watchlist')).toBeInTheDocument()
      expect(screen.getByText('0 tags watched')).toBeInTheDocument()
    })
  })

  it('rolls back on network error', async () => {
    const user = userEvent.setup()
    ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network'))

    render(<WatchlistManager allTags={TAGS} watchedTagIds={[]} />)
    await user.click(screen.getByText('RAG'))

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
      expect(screen.getByText('0 tags watched')).toBeInTheDocument()
    })
  })

  it('disables button while inflight', async () => {
    const user = userEvent.setup()
    let resolveFetch: (v: { ok: boolean }) => void
    ;(global.fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Promise((r) => { resolveFetch = r })
    )

    render(<WatchlistManager allTags={TAGS} watchedTagIds={[]} />)
    await user.click(screen.getByText('RAG'))

    // The button should be disabled while request is inflight
    const ragButton = screen.getByText('RAG').closest('button')
    expect(ragButton).toBeDisabled()

    // Resolve the pending request
    resolveFetch!({ ok: true })

    await waitFor(() => {
      expect(ragButton).not.toBeDisabled()
    })
  })
})
