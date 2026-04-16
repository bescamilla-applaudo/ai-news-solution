'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { NewsItemWithTags } from '@/lib/database.types'

interface SearchResult extends NewsItemWithTags {
  similarity?: number
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function ResultCard({ article }: { article: SearchResult }) {
  const tags = article.news_item_tags?.map((t) => t.tech_tags).filter(Boolean) ?? []
  const similarity = article.similarity ? Math.round(article.similarity * 100) : null

  return (
    <Link
      href={`/article/${article.id}`}
      className="block bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-600 transition-colors group"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h2 className="text-sm font-medium text-zinc-100 group-hover:text-white leading-snug line-clamp-2">
          {article.title}
        </h2>
        {similarity !== null && (
          <span className="shrink-0 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
            {similarity}%
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-zinc-500 border border-zinc-700 px-1.5 py-0.5 rounded uppercase tracking-wide">
          {article.source_name}
        </span>
        {article.impact_score && (
          <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
            Impact {article.impact_score}/10
          </span>
        )}
        {tags.slice(0, 2).map((tag) => (
          <span key={tag!.id} className="text-[10px] text-zinc-400 border border-zinc-700 px-1.5 py-0.5 rounded">
            {tag!.name}
          </span>
        ))}
      </div>
    </Link>
  )
}

function ResultSkeleton() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
      <Skeleton className="h-4 w-3/4 bg-zinc-800" />
      <Skeleton className="h-3 w-1/2 bg-zinc-800" />
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchShell loading />}>
      <SearchContent />
    </Suspense>
  )
}

function SearchShell({ loading }: { loading?: boolean }) {
  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <span className="text-xs text-zinc-500 shrink-0">← Back</span>
          <span className="text-zinc-700">|</span>
          <div className="flex-1 h-8" />
          {loading && <span className="text-[10px] text-zinc-500 shrink-0 animate-pulse">Loading…</span>}
        </div>
      </header>
    </div>
  )
}

function SearchContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialQuery = searchParams.get('q') ?? ''

  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [abortRef] = useState<{ current: AbortController | null }>({ current: null })

  const debouncedQuery = useDebounce(query, 300)

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) {
      setResults([])
      setSearched(false)
      return
    }

    // Abort any in-flight request before starting a new one
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
      if (res.status === 429) {
        setError('Too many searches. Please wait a moment.')
        return
      }
      if (res.status === 503) {
        setError('Search service is temporarily unavailable.')
        return
      }
      if (!res.ok) throw new Error('Search failed')
      const json = await res.json()
      setResults(json.data ?? [])
      setSearched(true)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError('Search failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [abortRef])

  useEffect(() => {
    doSearch(debouncedQuery)
    // Sync query param in URL without full navigation
    const url = debouncedQuery.trim()
      ? `/search?q=${encodeURIComponent(debouncedQuery.trim())}`
      : '/search'
    router.replace(url, { scroll: false })
  }, [debouncedQuery, doSearch, router])

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors shrink-0">
            ← Back
          </Link>
          <span className="text-zinc-700">|</span>
          <Input
            autoFocus
            placeholder="Search technical AI content…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent border-0 focus-visible:ring-0 text-sm text-zinc-100 placeholder:text-zinc-600 h-8 px-0"
          />
          {loading && (
            <span className="text-[10px] text-zinc-500 shrink-0 animate-pulse">Searching…</span>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {error && (
          <p className="text-sm text-red-400 mb-4">{error}</p>
        )}

        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <ResultSkeleton key={i} />)}
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="text-center py-16">
            <p className="text-zinc-500 text-sm">No results found for &ldquo;{query}&rdquo;</p>
            <p className="text-zinc-600 text-xs mt-1">Try different keywords or check spelling</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <>
            <p className="text-xs text-zinc-600 mb-4">
              {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{debouncedQuery}&rdquo;
            </p>
            <div className="space-y-3">
              {results.map((article) => (
                <ResultCard key={article.id} article={article} />
              ))}
            </div>
          </>
        )}

        {!loading && !searched && !query && (
          <div className="text-center py-16">
            <p className="text-zinc-600 text-sm">Start typing to search across all technical AI content</p>
          </div>
        )}
      </main>
    </div>
  )
}
