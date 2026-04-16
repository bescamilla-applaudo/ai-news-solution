import Link from 'next/link'
import { ArticleCard } from '@/components/article-card'
import { WatchlistManager } from '@/components/watchlist-manager'
import { NewsItemWithTags, TechTag } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

async function getWatchlistTags(userId: string): Promise<TechTag[]> {
  const { data } = await supabase
    .from('user_watchlist')
    .select('tech_tags(id, name, category)')
    .eq('user_id', userId)

  if (!data) return []
  return (data as Array<{ tech_tags: TechTag }>).map((row) => row.tech_tags).filter(Boolean)
}

async function getAllTags(): Promise<TechTag[]> {
  const { data } = await supabase
    .from('tech_tags')
    .select('id, name, category')
    .order('name')
  return data ?? []
}

async function getPersonalizedFeed(
  userId: string,
  watchedTagIds: string[]
): Promise<NewsItemWithTags[]> {
  if (watchedTagIds.length === 0) return []

  // Articles that have at least one of the user's watched tags
  const { data } = await supabase
    .from('news_items')
    .select('*, news_item_tags!inner(tech_tag_id, tech_tags(id, name, category))')
    .eq('is_filtered', true)
    .in('news_item_tags.tech_tag_id', watchedTagIds)
    .order('impact_score', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(40)

  return (data as unknown as NewsItemWithTags[]) ?? []
}

const OWNER_ID = 'owner'

export default async function WatchlistPage() {
  const [watchedTags, allTags] = await Promise.all([
    getWatchlistTags(OWNER_ID),
    getAllTags(),
  ])

  const watchedTagIds = watchedTags.map((t) => t.id)
  const articles = await getPersonalizedFeed(OWNER_ID, watchedTagIds)

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              ← Feed
            </Link>
            <span className="text-zinc-700">|</span>
            <span className="text-sm font-semibold text-zinc-100 tracking-tight">My Watchlist</span>
          </div>
          <Link
            href="/"
            className="text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 px-2.5 py-1 rounded transition-colors"
          >
            All Articles
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 lg:flex lg:gap-8">
        {/* Article feed */}
        <div className="flex-1 min-w-0">
          <div className="mb-5">
            <h1 className="text-lg font-semibold text-zinc-100">Your Feed</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {watchedTags.length === 0
                ? 'Add tags on the right to personalize your feed.'
                : `${articles.length} articles matching ${watchedTags.map((t) => t.name).join(', ')}`}
            </p>
          </div>

          {articles.length === 0 && watchedTags.length > 0 && (
            <p className="text-sm text-zinc-500 py-12 text-center">
              No articles yet for your watched tags. Check back soon.
            </p>
          )}

          <div className="space-y-3">
            {articles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        </div>

        {/* Tag manager sidebar */}
        <aside className="lg:w-64 shrink-0 mt-8 lg:mt-0">
          <WatchlistManager
            allTags={allTags}
            watchedTagIds={watchedTagIds}
          />
        </aside>
      </main>
    </div>
  )
}
