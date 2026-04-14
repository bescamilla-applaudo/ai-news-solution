import { getSession } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/watchlist — returns the list of tag IDs the authenticated user watches
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('user_watchlist')
    .select('tech_tag_id, tech_tags(id, name, category)')
    .eq('user_id', session.userId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}

// POST /api/watchlist — add a tag to the authenticated user's watchlist
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
      { user_id: session.userId, tech_tag_id },
      { onConflict: 'user_id,tech_tag_id' }
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 201 })
}

// DELETE /api/watchlist — remove a tag from the authenticated user's watchlist
export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
    .eq('user_id', session.userId)
    .eq('tech_tag_id', tech_tag_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
