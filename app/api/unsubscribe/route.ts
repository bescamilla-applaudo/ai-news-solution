import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/unsubscribe?token=<hmac>&uid=<user_id>
 *
 * The token is HMAC-SHA256(user_id, UNSUBSCRIBE_SECRET).
 * We never embed a raw user_id that would allow enumeration — the token
 * is what proves identity in this public route.
 *
 * Security: timingSafeEqual prevents timing attacks on token comparison.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  const uid = searchParams.get('uid')

  if (!token || !uid) {
    return new NextResponse('Invalid unsubscribe link.', { status: 400 })
  }

  const secret = process.env.UNSUBSCRIBE_SECRET
  if (!secret) {
    return new NextResponse('Server misconfiguration.', { status: 500 })
  }

  // Verify the token
  const expected = createHmac('sha256', secret).update(uid).digest('hex')
  const tokenBuf = Buffer.from(token, 'hex')
  const expectedBuf = Buffer.from(expected, 'hex')

  if (
    tokenBuf.length !== expectedBuf.length ||
    !timingSafeEqual(tokenBuf, expectedBuf)
  ) {
    return new NextResponse('Invalid or expired unsubscribe link.', { status: 403 })
  }

  const { error } = await supabase
    .from('email_subscriptions')
    .update({ active: false })
    .eq('user_id', uid)

  if (error) {
    return new NextResponse('Failed to unsubscribe. Please try again.', { status: 500 })
  }

  return new NextResponse(
    '<!doctype html><html><body style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center">' +
    '<h2>Unsubscribed</h2><p>You have been removed from the AI Intelligence weekly brief.</p>' +
    '<a href="/" style="color:#888">Return to dashboard</a></body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  )
}
