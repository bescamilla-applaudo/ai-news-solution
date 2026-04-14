import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Database } from './database.types'

// Lazy singleton — initialized on first use at request time, not at module load / build time.
let _client: SupabaseClient<Database> | null = null

function getClient(): SupabaseClient<Database> {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  _client = createClient<Database>(url, key)
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
