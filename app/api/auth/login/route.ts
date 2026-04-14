import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { password } = body as { password?: string }

  const expected = process.env.AUTH_PASSWORD ?? ''

  // Constant-time comparison to prevent timing attacks
  const a = Buffer.from(password ?? '', 'utf8')
  const b = Buffer.from(expected, 'utf8')
  const valid = a.length === b.length && a.length > 0 && timingSafeEqual(a, b)

  if (!valid) {
    // Small artificial delay to slow brute-force (on top of network latency)
    await new Promise((r) => setTimeout(r, 400))
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  await createSession()
  return NextResponse.json({ ok: true })
}
