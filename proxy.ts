/**
 * Next.js middleware — single-user JWT session guard.
 * Protects all routes except /login and the auth + unsubscribe API endpoints.
 * The JWT is verified locally using AUTH_SECRET; no external service is called.
 */
import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

// Routes that do NOT require authentication
const PUBLIC_PREFIXES = ['/login', '/api/auth/', '/api/unsubscribe']

function getSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET ?? ''
  return new TextEncoder().encode(s)
}

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow public paths through
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Allow Next.js static assets
  if (pathname.startsWith('/_next') || pathname.includes('.')) {
    return NextResponse.next()
  }

  const token = req.cookies.get('ai_news_session')?.value

  if (token) {
    try {
      await jwtVerify(token, getSecret())
      return NextResponse.next()
    } catch {
      // Token invalid or expired — fall through to redirect
    }
  }

  const loginUrl = new URL('/login', req.url)
  loginUrl.searchParams.set('next', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}

