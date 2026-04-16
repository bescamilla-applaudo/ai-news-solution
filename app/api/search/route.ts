import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireSupabase } from '@/lib/guards'

export async function GET(request: NextRequest) {
  const guard = requireSupabase()
  if (guard) return guard

  const query = new URL(request.url).searchParams.get('q')?.trim()
  if (!query || query.length < 2) {
    return NextResponse.json({ data: [] })
  }
  if (query.length > 200) {
    return NextResponse.json({ error: 'Query too long' }, { status: 400 })
  }

  try {
    // Call the Python worker embedding endpoint for local sentence-transformers
    const embedRes = await fetch(
      `${process.env.WORKER_EMBED_URL ?? 'http://localhost:8001'}/embed`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: query }),
        signal: AbortSignal.timeout(5000),
      }
    )

    if (!embedRes.ok) {
      return NextResponse.json(
        { data: [], error: 'Embedding service unavailable' },
        { status: 503 }
      )
    }

    const { embedding } = await embedRes.json()

    // Cosine similarity search via pgvector RPC
    const { data, error } = await supabase.rpc('match_articles', {
      query_embedding: embedding,
      match_count: 10,
      filter_id: null,
    })

    if (error) {
      console.error('[/api/search] Supabase RPC error:', error.message)
      return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }

    return NextResponse.json({ data: data ?? [] }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    })
  } catch (err) {
    console.error('[/api/search] Unexpected error:', err)
    return NextResponse.json({ data: [], error: 'Search temporarily unavailable' }, { status: 503 })
  }
}
