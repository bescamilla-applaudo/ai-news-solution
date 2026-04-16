import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireSupabase } from '@/lib/guards'

const PAGE_SIZE = 20

export async function GET(request: NextRequest) {
  const guard = requireSupabase()
  if (guard) return guard

  const { searchParams } = new URL(request.url)
  const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10))
  const tag = searchParams.get('tag') ?? null

  let query = supabase
    .from('news_items')
    .select('*, news_item_tags(tech_tags(*))', { count: 'exact' })
    .eq('is_filtered', true)
    .eq('archived', false)
    .order('impact_score', { ascending: false })
    .order('published_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  if (tag) {
    // Filter by tag name using the denormalized tags[] column for performance
    query = query.contains('tags', [tag])
  }

  const { data, error, count } = await query

  if (error) {
    console.error('[/api/news] Supabase error:', error.message)
    return NextResponse.json({ error: 'Failed to fetch articles' }, { status: 500 })
  }

  return NextResponse.json({
    data,
    meta: {
      page,
      pageSize: PAGE_SIZE,
      total: count ?? 0,
      hasMore: ((count ?? 0) > (page + 1) * PAGE_SIZE),
    },
  })
}
