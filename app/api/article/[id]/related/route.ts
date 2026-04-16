import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireSupabase } from '@/lib/guards'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = requireSupabase()
  if (guard) return guard

  const { id } = await params

  // Fetch the embedding for the current article
  const { data: article, error: fetchError } = await supabase
    .from('news_items')
    .select('embedding')
    .eq('id', id)
    .eq('is_filtered', true)
    .single()

  if (fetchError || !article?.embedding) {
    return NextResponse.json({ data: [] })
  }

  // Find top 5 similar articles by cosine distance using pgvector
  const { data, error } = await supabase.rpc('match_articles', {
    query_embedding: article.embedding,
    match_count: 6, // fetch 6, exclude self below
    filter_id: id,
  })

  if (error) {
    console.error('[/api/article/related] Supabase RPC error:', (error as { message: string }).message)
    return NextResponse.json({ error: 'Failed to find related articles' }, { status: 500 })
  }

  const related = (data ?? []).filter((a) => a.id !== id).slice(0, 5)

  return NextResponse.json({ data: related })
}
