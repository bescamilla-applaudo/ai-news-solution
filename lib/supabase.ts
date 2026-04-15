import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Database } from './database.types'

/**
 * Server-side Supabase client using the service role key.
 * This is safe because this module is ONLY imported in:
 *   - API routes (app/api/*)  — server-side only
 *   - Server components       — never bundled for the browser
 *   - Server Actions          — run on the server
 *
 * The service role key is never exposed to the browser. Next.js prevents
 * any module without NEXT_PUBLIC_ prefix from being included in client bundles
 * when imported only from server-side code.
 *
 * Using the service role key bypasses RLS, which is intentional for a
 * single-user personal app where the session middleware is the access gate.
 */

// Lazy singleton — initialized on first use at request time, not at module load / build time.
let _client: SupabaseClient<Database> | null = null

function getClient(): SupabaseClient<Database> {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
      'These must be set in .env.local'
    )
  }
  _client = createClient<Database>(url, key, {
    auth: { persistSession: false },
  })
  return _client
}

// Proxy so existing `supabase.from(...)` call sites work without change.
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop: string) {
    const client = getClient()
    const value = client[prop as keyof SupabaseClient<Database>]
    return typeof value === 'function' ? value.bind(client) : value
  },
})
