import { NextResponse } from 'next/server'

/**
 * Returns a 503 response when the Supabase client cannot initialise
 * (e.g. during Vercel builds where env vars are absent).
 * Call at the top of any API route handler that needs Supabase.
 */
export function requireSupabase(): NextResponse | null {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json(
      { error: 'Service unavailable' },
      { status: 503 },
    )
  }
  return null
}
