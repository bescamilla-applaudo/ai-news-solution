import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Fetch the embedding for the current article
  const { data: article, error: fetchError } = await supabase
    .from('news_items')
    .select('embedding')
    .eq('id', id)
    .eq('is_filtered', true)
    .single() as unknown as { data: { embedding: number[] | null } | null; error: unknown }

  if (fetchError || !article?.embedding) {
    return NextResponse.json({ data: [] })
  }

  // Find top 5 similar articles by cosine distance using pgvector
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('match_articles', {
    query_embedding: article.embedding,
    match_count: 6, // fetch 6, exclude self below
    filter_id: id,
  })

  if (error) {
    return NextResponse.json({ error: (error as { message: string }).message }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const related = (data as any[] ?? []).filter((a) => a.id !== id).slice(0, 5)

  return NextResponse.json({ data: related })
}
