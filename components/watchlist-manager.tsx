'use client'

import { useState, useTransition } from 'react'
import { TechTag } from '@/lib/database.types'

interface WatchlistManagerProps {
  allTags: TechTag[]
  watchedTagIds: string[]
}

export function WatchlistManager({ allTags, watchedTagIds: initial }: WatchlistManagerProps) {
  const [watched, setWatched] = useState<Set<string>>(new Set(initial))
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const toggle = (tag: TechTag) => {
    const isWatched = watched.has(tag.id)

    // Optimistic update
    setWatched((prev) => {
      const next = new Set(prev)
      if (isWatched) { next.delete(tag.id) } else { next.add(tag.id) }
      return next
    })
    setError(null)

    startTransition(async () => {
      try {
        const res = await fetch('/api/watchlist', {
          method: isWatched ? 'DELETE' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tech_tag_id: tag.id }),
        })
        if (!res.ok) {
          // Roll back on failure
          setWatched((prev) => {
            const next = new Set(prev)
            if (isWatched) { next.add(tag.id) } else { next.delete(tag.id) }
            return next
          })
          setError('Failed to update watchlist')
        }
      } catch {
        setWatched((prev) => {
          const next = new Set(prev)
          if (isWatched) { next.add(tag.id) } else { next.delete(tag.id) }
          return next
        })
        setError('Network error')
      }
    })
  }

  return (
    <div>
      <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">
        Watched Tags
      </h2>
      {error && (
        <p className="text-xs text-red-400 mb-2">{error}</p>
      )}
      <div className="space-y-1.5">
        {allTags.map((tag) => {
          const active = watched.has(tag.id)
          return (
            <button
              key={tag.id}
              onClick={() => toggle(tag)}
              disabled={isPending}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-colors ${
                active
                  ? 'bg-zinc-100 text-zinc-900 border-zinc-100'
                  : 'border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
              } ${isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span>{tag.name}</span>
              {active && (
                <span className="text-[10px] text-zinc-500 font-mono">✓</span>
              )}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-zinc-600 mt-3">
        {watched.size} tag{watched.size !== 1 ? 's' : ''} watched
      </p>
    </div>
  )
}
