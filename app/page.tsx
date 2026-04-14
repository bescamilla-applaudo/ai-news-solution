import Link from 'next/link'
import { CommandPalette } from '@/components/command-palette'
import { NewsFeed } from '@/components/news-feed'
import { AuthButtons } from '@/components/auth-buttons'

export default function HomePage() {
  return (
    <>
      <CommandPalette />
      <div className="min-h-screen bg-zinc-950">
        <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
          <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-zinc-100 tracking-tight">
                AI Intelligence
              </span>
              <span className="text-[10px] text-zinc-500 border border-zinc-700 px-1.5 py-0.5 rounded">
                TECHNICAL ONLY
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/watchlist"
                className="text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 px-2.5 py-1 rounded transition-colors"
              >
                My Watchlist
              </Link>
              <AuthButtons />
            </div>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-6">
          <div className="mb-6">
            <h1 className="text-lg font-semibold text-zinc-100">
              Technical AI Intelligence
            </h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              LLM releases, multi-agent architectures, and developer tooling — filtered for signal.
            </p>
          </div>
          <NewsFeed />
        </main>
      </div>
    </>
  )
}
