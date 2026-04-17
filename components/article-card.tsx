import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { NewsItemWithTags } from '@/lib/database.types'

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'Unknown date'
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffHours < 1) return 'Just now'
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ScoreBar({ score, label }: { score: number | null; label: string }) {
  if (!score) return null
  const pct = (score / 10) * 100
  const color =
    score >= 8 ? 'bg-emerald-500' : score >= 5 ? 'bg-amber-500' : 'bg-zinc-500'
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-400">
      <span className="w-14 shrink-0">{label}</span>
      <div
        className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden"
        role="progressbar"
        aria-label={`${label} score`}
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={10}
      >
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-4 text-right font-mono">{score}</span>
    </div>
  )
}

interface ArticleCardProps {
  article: NewsItemWithTags
  minimal?: boolean
}

export function ArticleCard({ article, minimal = false }: ArticleCardProps) {
  const tags = article.news_item_tags
    ?.map((t) => t.tech_tags)
    .filter(Boolean)
    .slice(0, 3) ?? []

  const sourceBadgeColor: Record<string, string> = {
    huggingface: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    openai: 'bg-green-500/10 text-green-400 border-green-500/20',
    arxiv: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    deepmind: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    hn: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  }
  const sourceBg = sourceBadgeColor[article.source_name] ?? 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'

  return (
    <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors" role="article" aria-label={article.title}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <Link
            href={`/article/${article.id}`}
            className="text-sm font-medium text-zinc-100 hover:text-white leading-snug line-clamp-2"
          >
            {article.title}
          </Link>
          <span className="text-xs text-zinc-500 shrink-0">
            {formatRelativeTime(article.published_at)}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-1">
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wide ${sourceBg}`}
            aria-label={`Source: ${article.source_name}`}
          >
            {article.source_name}
          </span>
          {tags.map((tag) => (
            <Badge
              key={tag!.id}
              variant="outline"
              className="text-[10px] px-1.5 py-0.5 h-auto border-zinc-700 text-zinc-400"
            >
              {tag!.name}
            </Badge>
          ))}
        </div>
      </CardHeader>

      {!minimal && (
        <CardContent className="pt-0 space-y-2">
          {article.technical_summary && (
            <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
              {article.technical_summary.replace(/[#*`]/g, '').slice(0, 200)}
            </p>
          )}
          <div className="space-y-1 pt-1">
            <ScoreBar score={article.impact_score} label="Impact" />
            <ScoreBar score={article.depth_score} label="Depth" />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Link
              href={`/article/${article.id}`}
              className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              View Details →
            </Link>
            <a
              href={article.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              View Source ↗
            </a>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
