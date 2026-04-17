import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireSupabase } from '@/lib/guards'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'

const OWNER_ID = 'owner'

// Rate limit helper for watchlist routes
function rateLimitWatchlist(request: NextRequest): NextResponse | null {
  const ip = getClientIP(request.headers)
  const rl = checkRateLimit(`watchlist:${ip}`, { max: 30, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
      }
    )
  }
  return null
}

// GET /api/watchlist — returns the list of watched tags
export async function GET() {
  const guard = requireSupabase()
  if (guard) return guard

  const { data, error } = await supabase
    .from('user_watchlist')
    .select('tech_tag_id, tech_tags(id, name, category)')
    .eq('user_id', OWNER_ID)

  if (error) {
    console.error('[/api/watchlist] GET error:', error.message)
    return NextResponse.json({ error: 'Failed to fetch watchlist' }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}

// POST /api/watchlist — add a tag to the watchlist
export async function POST(request: NextRequest) {
  const rlBlock = rateLimitWatchlist(request)
  if (rlBlock) return rlBlock

  const guard = requireSupabase()
  if (guard) return guard

  let body: { tech_tag_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { tech_tag_id } = body
  if (!tech_tag_id || typeof tech_tag_id !== 'string') {
    return NextResponse.json({ error: 'tech_tag_id is required' }, { status: 400 })
  }

  // Verify the tag exists before inserting (prevents foreign key errors)
  const { data: tag } = await supabase
    .from('tech_tags')
    .select('id')
    .eq('id', tech_tag_id)
    .single()

  if (!tag) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('user_watchlist')
    .upsert(
      { user_id: OWNER_ID, tech_tag_id },
      { onConflict: 'user_id,tech_tag_id' }
    )

  if (error) {
    console.error('[/api/watchlist] POST error:', error.message)
    return NextResponse.json({ error: 'Failed to add tag to watchlist' }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 201 })
}

// DELETE /api/watchlist — remove a tag from the watchlist
export async function DELETE(request: NextRequest) {
  const rlBlock = rateLimitWatchlist(request)
  if (rlBlock) return rlBlock

  const guard = requireSupabase()
  if (guard) return guard

  let body: { tech_tag_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { tech_tag_id } = body
  if (!tech_tag_id || typeof tech_tag_id !== 'string') {
    return NextResponse.json({ error: 'tech_tag_id is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('user_watchlist')
    .delete()
    .eq('user_id', OWNER_ID)
    .eq('tech_tag_id', tech_tag_id)

  if (error) {
    console.error('[/api/watchlist] DELETE error:', error.message)
    return NextResponse.json({ error: 'Failed to remove tag from watchlist' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
