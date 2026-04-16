import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ArticleCard } from '@/components/article-card'
import { NewsItemWithTags } from '@/lib/database.types'

// Mock next/link to render a plain anchor
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

function makeArticle(overrides: Partial<NewsItemWithTags> = {}): NewsItemWithTags {
  return {
    id: 'art-1',
    source_url: 'https://example.com/article',
    source_name: 'arxiv',
    title: 'Test Article Title',
    raw_content: 'raw content here',
    technical_summary: 'A short technical summary for testing purposes.',
    impact_score: 8,
    depth_score: 6,
    implementation_steps: [],
    affected_workflows: [],
    embedding: null,
    category: 'Technical',
    tags: ['RAG', 'LLM-Release'],
    published_at: new Date(Date.now() - 3600_000).toISOString(), // 1h ago
    is_filtered: true,
    created_at: new Date().toISOString(),
    news_item_tags: [
      { tech_tags: { id: 't1', name: 'RAG', category: 'AI' } },
      { tech_tags: { id: 't2', name: 'LLM-Release', category: 'AI' } },
    ],
    ...overrides,
  } as NewsItemWithTags
}

describe('ArticleCard', () => {
  it('renders title and source badge', () => {
    render(<ArticleCard article={makeArticle()} />)
    expect(screen.getByText('Test Article Title')).toBeInTheDocument()
    expect(screen.getByText('arxiv')).toBeInTheDocument()
  })

  it('renders tags (max 3)', () => {
    render(<ArticleCard article={makeArticle()} />)
    expect(screen.getByText('RAG')).toBeInTheDocument()
    expect(screen.getByText('LLM-Release')).toBeInTheDocument()
  })

  it('renders score bars in full mode', () => {
    render(<ArticleCard article={makeArticle()} />)
    expect(screen.getByText('Impact')).toBeInTheDocument()
    expect(screen.getByText('Depth')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()
  })

  it('hides score bars and summary in minimal mode', () => {
    render(<ArticleCard article={makeArticle()} minimal />)
    expect(screen.queryByText('Impact')).not.toBeInTheDocument()
    expect(screen.queryByText('Depth')).not.toBeInTheDocument()
    expect(screen.queryByText('View Details →')).not.toBeInTheDocument()
  })

  it('renders detail and source links', () => {
    render(<ArticleCard article={makeArticle()} />)
    const detailLink = screen.getByText('View Details →')
    expect(detailLink).toHaveAttribute('href', '/article/art-1')
    const sourceLink = screen.getByText('View Source ↗')
    expect(sourceLink).toHaveAttribute('href', 'https://example.com/article')
    expect(sourceLink).toHaveAttribute('target', '_blank')
  })

  it('truncates long summaries to 200 chars', () => {
    const longSummary = 'A'.repeat(300)
    render(<ArticleCard article={makeArticle({ technical_summary: longSummary })} />)
    // The component slices to 200 chars
    const paragraph = screen.getByText('A'.repeat(200))
    expect(paragraph).toBeInTheDocument()
  })

  it('applies emerald color for high scores', () => {
    const { container } = render(<ArticleCard article={makeArticle({ impact_score: 9 })} />)
    const emeraldBar = container.querySelector('.bg-emerald-500')
    expect(emeraldBar).toBeInTheDocument()
  })

  it('applies amber color for medium scores', () => {
    const { container } = render(<ArticleCard article={makeArticle({ impact_score: 5, depth_score: 5 })} />)
    const amberBars = container.querySelectorAll('.bg-amber-500')
    expect(amberBars.length).toBeGreaterThan(0)
  })

  it('handles null scores gracefully', () => {
    render(<ArticleCard article={makeArticle({ impact_score: null as unknown as number, depth_score: null as unknown as number })} />)
    expect(screen.queryByText('Impact')).not.toBeInTheDocument()
    expect(screen.queryByText('Depth')).not.toBeInTheDocument()
  })

  it('handles missing tags', () => {
    render(<ArticleCard article={makeArticle({ news_item_tags: [] })} />)
    expect(screen.getByText('Test Article Title')).toBeInTheDocument()
  })
})
