import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const query = new URL(request.url).searchParams.get('q')?.trim()
  if (!query || query.length < 2) {
    return NextResponse.json({ data: [] })
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
        { status: 200 }
      )
    }

    const { embedding } = await embedRes.json()

    // Cosine similarity search via pgvector RPC
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('match_articles', {
      query_embedding: embedding,
      match_count: 10,
      filter_id: null,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed'
    return NextResponse.json({ data: [], error: message }, { status: 200 })
  }
}
