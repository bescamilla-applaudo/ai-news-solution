import { deleteSession } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function POST() {
  await deleteSession()
  // Return 200 so the client-side fetch() resolves cleanly.
  // The AuthButtons component handles the redirect to /login.
  return NextResponse.json({ ok: true })
}
