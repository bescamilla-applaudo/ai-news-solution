import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireSupabase } from '@/lib/guards'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'

const OWNER_ID = 'owner'

// Strict email validation: RFC 5322 simplified
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

/**
 * POST /api/email-subscribe
 * Body: { email: string }
 *
 * Subscribes the single owner user to the weekly intelligence brief.
 * Validates email format, upserts into email_subscriptions (reactivates if previously unsubscribed).
 */
export async function POST(request: NextRequest) {
  // Rate limit: 5 req/min — subscribe is a rare action
  const ip = getClientIP(request.headers)
  const rl = checkRateLimit(`email-subscribe:${ip}`, { max: 5, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
      }
    )
  }

  const guard = requireSupabase()
  if (guard) return guard

  // Parse and validate body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('email' in body) ||
    typeof (body as Record<string, unknown>).email !== 'string'
  ) {
    return NextResponse.json(
      { error: 'Missing required field: email' },
      { status: 400 }
    )
  }

  const email = ((body as Record<string, unknown>).email as string).trim().toLowerCase()

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: 'Invalid email address' },
      { status: 400 }
    )
  }

  // Upsert: insert or reactivate existing subscription
  try {
    const { error } = await supabase
      .from('email_subscriptions')
      .upsert(
        { user_id: OWNER_ID, email, active: true },
        { onConflict: 'user_id' }
      )

    if (error) {
      console.error('[/api/email-subscribe] DB error:', error.message)
      return NextResponse.json(
        { error: 'Failed to subscribe' },
        { status: 500 }
      )
    }
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }

  return NextResponse.json(
    { message: 'Subscribed successfully' },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    }
  )
}

/**
 * GET /api/email-subscribe
 *
 * Returns the current subscription status for the owner.
 */
export async function GET() {
  const guard = requireSupabase()
  if (guard) return guard

  try {
    const { data, error } = await supabase
      .from('email_subscriptions')
      .select('email, active')
      .eq('user_id', OWNER_ID)
      .maybeSingle()

    if (error) {
      console.error('[/api/email-subscribe] GET error:', error.message)
      return NextResponse.json(
        { error: 'Failed to fetch subscription' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { data: data ?? null },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
