'use client'

import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-client'

export default function LoginPage() {
  const supabase = createSupabaseBrowserClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage('Starting login...')

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setMessage(`Login error: ${error.message}`)
        setLoading(false)
        return
      }

      setMessage(`Login succeeded for user: ${data.user?.email ?? 'unknown'}`)

      setTimeout(() => {
        window.location.href = '/invoices'
      }, 1000)
    } catch (err) {
      console.error('Login unexpected error:', err)
      setMessage('Unexpected login error. Check browser console.')
      setLoading(false)
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: '60px auto', padding: 24 }}>
      <h1>Log in</h1>

      <form onSubmit={handleLogin} style={{ display: 'grid', gap: 12 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Log in'}
        </button>
      </form>

      {message ? <p style={{ marginTop: 12 }}>{message}</p> : null}

      <p style={{ marginTop: 16 }}>
        Need an account? <a href="/signup">Sign up</a>
      </p>
    </main>
  )
}