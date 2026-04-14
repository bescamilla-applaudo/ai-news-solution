import { deleteSession } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function POST() {
  await deleteSession()
  return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'))
}
