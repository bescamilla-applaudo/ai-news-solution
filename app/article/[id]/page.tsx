import { notFound } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { ArticleCard } from '@/components/article-card'
import { CodeBlock } from '@/components/code-block'
import { NewsItemWithTags, ImplementationStep } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

async function getArticle(id: string): Promise<NewsItemWithTags | null> {
  const { data, error } = await supabase
    .from('news_items')
    .select('*, news_item_tags(tech_tags(*))')
    .eq('id', id)
    .eq('is_filtered', true)
    .single()

  if (error || !data) return null
  return data as unknown as NewsItemWithTags
}

async function getRelated(id: string): Promise<NewsItemWithTags[]> {
  const { data } = await supabase.rpc('match_articles', {
    query_embedding: await getArticleEmbedding(id),
    match_count: 6,
    filter_id: id,
  })
  return ((data ?? []).filter((a) => a.id !== id).slice(0, 5)) as unknown as NewsItemWithTags[]
}

async function getArticleEmbedding(id: string): Promise<number[]> {
  const { data } = await supabase
    .from('news_items')
    .select('embedding')
    .eq('id', id)
    .single()
  return data?.embedding ?? []
}

function ScoreChip({ label, value }: { label: string; value: number | null }) {
  if (!value) return null
  const color =
    value >= 8 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    : value >= 5 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    : 'bg-zinc-500/10 text-zinc-400 border-zinc-600'
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded border font-medium ${color}`}>
      {label} {value}/10
    </span>
  )
}

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [article, related] = await Promise.all([getArticle(id), getRelated(id)])

  if (!article) notFound()

  const tags = article.news_item_tags?.map((t) => t.tech_tags).filter(Boolean) ?? []
  const steps: ImplementationStep[] = (article.implementation_steps as ImplementationStep[]) ?? []

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            ← Back
          </Link>
          <span className="text-zinc-700">|</span>
          <span className="text-sm font-semibold text-zinc-100 tracking-tight">AI Intelligence</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8 lg:flex lg:gap-8">
        {/* Main article */}
        <article className="flex-1 min-w-0">
          {/* Source + meta */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wide border border-zinc-700 px-1.5 py-0.5 rounded">
              {article.source_name}
            </span>
            <ScoreChip label="Impact" value={article.impact_score} />
            <ScoreChip label="Depth" value={article.depth_score} />
            {tags.map((tag) => (
              <Badge key={tag!.id} variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">
                {tag!.name}
              </Badge>
            ))}
          </div>

          <h1 className="text-xl font-semibold text-zinc-100 leading-snug mb-4">
            {article.title}
          </h1>

          {article.affected_workflows && article.affected_workflows.length > 0 && (
            <div className="mb-4 p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
              <p className="text-[11px] text-zinc-500 uppercase tracking-wide mb-1.5">Affects</p>
              <div className="flex flex-wrap gap-1.5">
                {article.affected_workflows.map((wf) => (
                  <span key={wf} className="text-xs text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded">
                    {wf}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Technical summary — rendered via react-markdown (no dangerouslySetInnerHTML) */}
          {article.technical_summary && (
            <div className="prose prose-invert prose-sm max-w-none mb-6 text-zinc-300 [&>p]:leading-relaxed [&>p]:text-sm [&>ul]:text-sm [&>ol]:text-sm [&>h1]:text-zinc-100 [&>h2]:text-zinc-100 [&>h3]:text-zinc-200 [&>code]:text-emerald-300 [&>pre]:bg-zinc-950 [&>pre]:border [&>pre]:border-zinc-800 [&>pre]:rounded [&>pre]:overflow-x-auto">
              <ReactMarkdown>{article.technical_summary}</ReactMarkdown>
            </div>
          )}

          {/* Implementation steps */}
          {steps.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-zinc-200 mb-3">Implementation Steps</h2>
              <Accordion className="space-y-1">
                {steps.map((step) => (
                  <AccordionItem
                    key={step.step}
                    value={step.step}
                    className="bg-zinc-900 border border-zinc-800 rounded-lg px-4"
                  >
                    <AccordionTrigger className="text-sm text-zinc-200 hover:no-underline py-3">
                      <span className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">
                          {step.step}
                        </span>
                        {step.description}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3 space-y-2">
                      {step.code && (
                        <CodeBlock code={step.code} />
                      )}
                      {step.link && (
                        <a
                          href={step.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          {step.link} ↗
                        </a>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}

          <a
            href={article.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 px-3 py-1.5 rounded transition-colors"
          >
            View Original Source ↗
          </a>
        </article>

        {/* Related articles sidebar */}
        {related.length > 0 && (
          <aside className="lg:w-72 shrink-0 mt-8 lg:mt-0">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">
              Related
            </h2>
            <div className="space-y-3">
              {related.map((r) => (
                <ArticleCard key={r.id} article={r} minimal />
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
