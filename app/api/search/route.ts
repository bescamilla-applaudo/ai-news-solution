import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { supabase } from '@/lib/supabase'
import OpenAI from 'openai'

const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW_SECONDS = 60

export async function GET(request: NextRequest) {
  // Lazy-initialize clients at request time (not module load / build time)
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

  // Rate limiting: 20 requests per minute per IP
  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'anonymous'
  const rateLimitKey = `rate:search:${ip}`
  const count = await redis.incr(rateLimitKey)
  if (count === 1) {
    await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW_SECONDS)
  }
  if (count > RATE_LIMIT_MAX) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  }

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
