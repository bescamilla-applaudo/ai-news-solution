'use client'

import { useState, FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Suspense } from 'react'

function LoginForm() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const params = useSearchParams()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    setLoading(false)

    if (res.ok) {
      const next = params.get('next') ?? '/'
      router.push(next)
    } else {
      setError('Contraseña incorrecta')
      setPassword('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-xs">
      <div className="space-y-1">
        <label htmlFor="password" className="text-xs text-zinc-400 uppercase tracking-widest">
          Contraseña
        </label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          autoComplete="current-password"
          className="bg-zinc-900 border-zinc-700 text-zinc-100"
          placeholder="••••••••"
        />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Entrando…' : 'Entrar'}
      </Button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center gap-6">
      <div className="text-center mb-2">
        <h1 className="text-xl font-bold tracking-tight">AI News Intelligence</h1>
        <p className="text-xs text-zinc-500 mt-1">Acceso personal</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  )
}
