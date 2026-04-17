import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireSupabase } from '@/lib/guards'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  const guard = requireSupabase()
  if (guard) return guard

  const ip = getClientIP(request.headers)
  const rl = checkRateLimit(`tags:${ip}`, { max: 30, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
      }
    )
  }

  const { data, error } = await supabase
    .from('tech_tags')
    .select('id, name, category')
    .order('name')

  if (error) {
    console.error('[/api/tags] Supabase error:', error.message)
    return NextResponse.json({ error: 'Failed to fetch tags' }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] }, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  })
}
