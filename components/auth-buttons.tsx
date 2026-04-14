'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function AuthButtons() {
  const router = useRouter()

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={logout}
      className="border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 text-xs"
    >
      Salir
    </Button>
  )
}
