'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

interface SubscriptionData {
  email: string
  active: boolean
}

async function fetchSubscription(): Promise<SubscriptionData | null> {
  const res = await fetch('/api/email-subscribe')
  if (!res.ok) return null
  const json = await res.json()
  return json.data ?? null
}

async function subscribe(email: string): Promise<void> {
  const res = await fetch('/api/email-subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({ error: 'Failed to subscribe' }))
    throw new Error(json.error ?? 'Failed to subscribe')
  }
}

export function EmailSubscribe() {
  const [email, setEmail] = useState('')
  const queryClient = useQueryClient()

  const { data: subscription } = useQuery({
    queryKey: ['email-subscription'],
    queryFn: fetchSubscription,
    staleTime: 60_000,
  })

  const mutation = useMutation({
    mutationFn: subscribe,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-subscription'] })
      setEmail('')
    },
  })

  // Already subscribed and active
  if (subscription?.active) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Weekly brief active — {subscription.email}
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (email.trim()) mutation.mutate(email.trim())
      }}
      className="flex items-center gap-2"
      role="form"
      aria-label="Subscribe to weekly AI intelligence brief"
    >
      <input
        type="email"
        placeholder="your@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        maxLength={254}
        aria-label="Email address for weekly brief"
        className="h-7 px-2 text-xs bg-zinc-900 border border-zinc-700 rounded text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 w-48"
      />
      <button
        type="submit"
        disabled={mutation.isPending || !email.trim()}
        className="h-7 px-3 text-xs font-medium bg-zinc-800 text-zinc-200 border border-zinc-700 rounded hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {mutation.isPending ? 'Subscribing…' : 'Subscribe'}
      </button>
      {mutation.isError && (
        <span className="text-xs text-red-400" role="alert">
          {mutation.error.message}
        </span>
      )}
    </form>
  )
}
