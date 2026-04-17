'use client'

import { useEffect, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ArticleCard } from '@/components/article-card'
import { Skeleton } from '@/components/ui/skeleton'
import { NewsItemWithTags } from '@/lib/database.types'

const FALLBACK_TAGS = [
  'LLM', 'Agents', 'RAG', 'Multi-Agent', 'Dev-Tools',
  'Fine-Tuning', 'Code-Generation', 'Open-Source', 'MCP', 'Reasoning',
]

const MAX_PAGES = 20 // Cap at ~400 articles in memory

async function fetchNews({ pageParam = 0, tag }: { pageParam?: number; tag: string | null }) {
  const params = new URLSearchParams({ page: String(pageParam) })
  if (tag) params.set('tag', tag)
  const res = await fetch(`/api/news?${params}`)
  if (!res.ok) throw new Error('Failed to fetch news')
  return res.json()
}

export function NewsFeed() {
  const [activeTag, setActiveTag] = useState<string | null>(null)

  const { data: tagsData } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const res = await fetch('/api/tags')
      if (!res.ok) return { data: [] }
      return res.json()
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  })
  const tags: string[] = tagsData?.data?.length
    ? tagsData.data.map((t: { name: string }) => t.name)
    : FALLBACK_TAGS

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } =
    useInfiniteQuery({
      queryKey: ['news', activeTag],
      queryFn: ({ pageParam }) => fetchNews({ pageParam, tag: activeTag }),
      initialPageParam: 0,
      getNextPageParam: (lastPage) =>
        lastPage.meta.hasMore ? lastPage.meta.page + 1 : undefined,
    })

  // Infinite scroll: load next page when user reaches bottom (capped)
  useEffect(() => {
    const handleScroll = () => {
      const pagesLoaded = data?.pages.length ?? 0
      if (
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 400 &&
        hasNextPage &&
        !isFetchingNextPage &&
        pagesLoaded < MAX_PAGES
      ) {
        fetchNextPage()
      }
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, data?.pages.length])

  const articles: NewsItemWithTags[] =
    data?.pages.flatMap((p) => p.data ?? []) ?? []

  return (
    <div className="space-y-4">
      {/* Tag filter bar */}
      <nav aria-label="Filter articles by tag" className="flex flex-wrap gap-2" role="toolbar">
        <button
          onClick={() => setActiveTag(null)}
          aria-pressed={activeTag === null}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            activeTag === null
              ? 'bg-zinc-100 text-zinc-900 border-zinc-100'
              : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
          }`}
        >
          All
        </button>
        {tags.map((tag) => (
          <button
            key={tag}
            onClick={() => setActiveTag(tag === activeTag ? null : tag)}
            aria-pressed={activeTag === tag}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              activeTag === tag
                ? 'bg-zinc-100 text-zinc-900 border-zinc-100'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
            }`}
          >
            {tag}
          </button>
        ))}
      </nav>

      {/* Loading skeletons */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full bg-zinc-800 rounded-lg" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-sm text-red-400 text-center py-8">
          Failed to load articles. Please try again.
        </p>
      )}

      {/* Article list */}
      {!isLoading && articles.length === 0 && (
        <p className="text-sm text-zinc-500 text-center py-12" role="status">
          No articles found{activeTag ? ` for tag "${activeTag}"` : ''}.
        </p>
      )}

      <div className="space-y-3" role="feed" aria-label="AI news articles" aria-busy={isLoading || isFetchingNextPage}>
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </div>

      {isFetchingNextPage && (
        <div className="space-y-3 pt-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full bg-zinc-800 rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && !hasNextPage && articles.length > 0 && (() => {
        const total = data?.pages[0]?.meta?.total ?? articles.length
        const pagesLoaded = data?.pages.length ?? 0
        const capped = pagesLoaded >= MAX_PAGES && total > articles.length
        return (
          <p className="text-xs text-zinc-600 text-center py-6">
            {capped
              ? `Showing ${articles.length} of ${total} articles`
              : 'All caught up'}
          </p>
        )
      })()}
    </div>
  )
}
