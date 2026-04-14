/**
 * Single-user session auth using a signed JWT stored in an httpOnly cookie.
 * No external service involved — the secret never leaves your machine.
 *
 * Environment variables required:
 *   AUTH_SECRET   — at least 32 random bytes (hex). Generate: openssl rand -hex 32
 *   AUTH_PASSWORD — the login password you'll type in the browser
 */
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'ai_news_session'
const SESSION_DAYS = 30
const OWNER_ID = 'owner' // single-user constant; stored in DB user_id columns

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET must be at least 32 characters. Run: openssl rand -hex 32')
  }
  return new TextEncoder().encode(secret)
}

export async function createSession(): Promise<void> {
  const token = await new SignJWT({ sub: OWNER_ID })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret())

  const jar = await cookies()
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  })
}

export async function getSession(): Promise<{ userId: string } | null> {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return { userId: payload.sub as string }
  } catch {
    return null
  }
}

export async function deleteSession(): Promise<void> {
  const jar = await cookies()
  jar.delete(COOKIE_NAME)
}

export { OWNER_ID }
