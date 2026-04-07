'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { isAdminEmail } from '@/lib/admin'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // Check if user is admin by email (env-based, no DB lookup)
    const admin = isAdminEmail(data.user?.email)

    // Force a full page navigation so the server-side middleware/layouts
    // re-evaluate the new auth cookies on a fresh request.
    window.location.href = admin ? '/admin' : '/dashboard'
  }

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {/* Logo */}
          <div className="inline-flex items-center justify-center w-16 h-16 mb-4">
            <img src="/logo.svg" alt="North Star Ventures" className="w-12 h-12" />
          </div>
          <h1 className="text-2xl font-heading font-bold text-text-primary">North Star Ventures</h1>
          <p className="text-text-muted mt-1 text-sm tracking-widest uppercase">CRM</p>
        </div>

        <form onSubmit={handleLogin} className="bg-dark-card border border-dark-border rounded-xl shadow-gold-md p-8">
          <div className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-dark-elevated border border-dark-border rounded-lg text-text-primary placeholder-text-muted focus:ring-2 focus:ring-gold focus:border-gold outline-none transition-all duration-200"
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-text-secondary mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 bg-dark-elevated border border-dark-border rounded-lg text-text-primary placeholder-text-muted focus:ring-2 focus:ring-gold focus:border-gold outline-none transition-all duration-200"
                placeholder="Enter your password"
                required
              />
            </div>

            {error && (
              <div className="text-danger text-sm bg-danger/10 border border-danger/20 p-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gold text-dark py-2.5 rounded-lg font-bold hover:bg-gold-hover transition-all duration-200 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
