'use server'

import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { createHmac } from 'crypto'

function makeUnsubscribeToken(userId: string): string {
  const secret = process.env.UNSUBSCRIBE_SECRET
  if (!secret) throw new Error('UNSUBSCRIBE_SECRET is not set')
  return createHmac('sha256', secret).update(userId).digest('hex')
}

export async function subscribeToWeeklyBrief(email: string): Promise<{ error?: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthorized' }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Invalid email address' }
  }

  const { error } = await supabase
    .from('email_subscriptions')
    .upsert(
      { user_id: session.userId, email: email.toLowerCase().trim(), active: true },
      { onConflict: 'user_id' }
    )

  if (error) return { error: error.message }

  revalidatePath('/watchlist')
  return {}
}

export async function unsubscribeFromWeeklyBrief(): Promise<{ error?: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('email_subscriptions')
    .update({ active: false })
    .eq('user_id', session.userId)

  if (error) return { error: error.message }

  revalidatePath('/watchlist')
  return {}
}

export { makeUnsubscribeToken }
