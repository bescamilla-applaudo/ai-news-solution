'use client'

import { useEffect, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ArticleCard } from '@/components/article-card'
import { Skeleton } from '@/components/ui/skeleton'
import { NewsItemWithTags } from '@/lib/database.types'

const ALL_TAGS = [
  'Multi-Agent', 'LLM-Release', 'RAG', 'Dev-Tools',
  'Research', 'Methodologies', 'LangGraph', 'Claude', 'Agents', 'Embeddings',
]

async function fetchNews({ pageParam = 0, tag }: { pageParam?: number; tag: string | null }) {
  const params = new URLSearchParams({ page: String(pageParam) })
  if (tag) params.set('tag', tag)
  const res = await fetch(`/api/news?${params}`)
  if (!res.ok) throw new Error('Failed to fetch news')
  return res.json()
}

export function NewsFeed() {
  const [activeTag, setActiveTag] = useState<string | null>(null)

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } =
    useInfiniteQuery({
      queryKey: ['news', activeTag],
      queryFn: ({ pageParam }) => fetchNews({ pageParam, tag: activeTag }),
      initialPageParam: 0,
      getNextPageParam: (lastPage) =>
        lastPage.meta.hasMore ? lastPage.meta.page + 1 : undefined,
    })

  // Infinite scroll: load next page when user reaches bottom
  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 400 &&
        hasNextPage &&
        !isFetchingNextPage
      ) {
        fetchNextPage()
      }
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const articles: NewsItemWithTags[] =
    data?.pages.flatMap((p) => p.data ?? []) ?? []

  return (
    <div className="space-y-4">
      {/* Tag filter bar */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveTag(null)}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            activeTag === null
              ? 'bg-zinc-100 text-zinc-900 border-zinc-100'
              : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
          }`}
        >
          All
        </button>
        {ALL_TAGS.map((tag) => (
          <button
            key={tag}
            onClick={() => setActiveTag(tag === activeTag ? null : tag)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              activeTag === tag
                ? 'bg-zinc-100 text-zinc-900 border-zinc-100'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

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
        <p className="text-sm text-zinc-500 text-center py-12">
          No articles found{activeTag ? ` for tag "${activeTag}"` : ''}.
        </p>
      )}

      <div className="space-y-3">
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
    </div>
  )
}
