'use client'

import { useUser } from '@clerk/nextjs'
import { SignInButton, UserButton } from '@clerk/nextjs'

export function AuthButtons() {
  const { isSignedIn, isLoaded } = useUser()

  if (!isLoaded) return <div className="w-8 h-8" />

  if (isSignedIn) {
    return <UserButton />
  }

  return (
    <SignInButton mode="modal">
      <button className="text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 px-2.5 py-1 rounded transition-colors">
        Sign In
      </button>
    </SignInButton>
  )
}
