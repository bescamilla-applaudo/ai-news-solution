import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import OpenAI from 'openai'

export async function GET(request: NextRequest) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

  const query = new URL(request.url).searchParams.get('q')?.trim()
  if (!query || query.length < 2) {
    return NextResponse.json({ data: [] })
  }

  // Generate embedding for the search query
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  })
  const queryEmbedding = embeddingResponse.data[0].embedding

  // Cosine similarity search via pgvector RPC
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('match_articles', {
    query_embedding: queryEmbedding,
    match_count: 10,
    filter_id: null,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}
