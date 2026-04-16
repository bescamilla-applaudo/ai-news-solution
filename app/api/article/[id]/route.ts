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

  const { data, error } = await supabase
    .from('news_items')
    .select('*, news_item_tags(tech_tags(*))')
    .eq('id', id)
    .eq('is_filtered', true)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 })
  }

  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  })
}
