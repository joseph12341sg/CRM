'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

function generatePassword(length = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*'
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => chars[byte % chars.length]).join('')
}

interface CreatedClient {
  client: { id: string; name: string; email: string }
  credentials: { email: string; password: string }
}

export default function CreateClientPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [metaAdAccountId, setMetaAdAccountId] = useState('')
  const [metaAccessToken, setMetaAccessToken] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedClient | null>(null)
  const [copied, setCopied] = useState(false)

  const regeneratePassword = useCallback(() => {
    setPassword(generatePassword())
  }, [])

  useEffect(() => {
    regeneratePassword()
  }, [regeneratePassword])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/create-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          meta_ad_account_id: metaAdAccountId || undefined,
          meta_access_token: metaAccessToken || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create client')
      }

      setCreated(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  async function copyCredentials() {
    if (!created) return
    const text = `Email: ${created.credentials.email}\nPassword: ${created.credentials.password}`
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Success state
  if (created) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-navy text-white px-6 py-4">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <h1 className="text-lg font-semibold tracking-tight">North Star Ventures</h1>
            <Link
              href="/admin"
              className="text-sm text-gold hover:text-gold-200 transition-colors"
            >
              Back to Command Centre
            </Link>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-6 py-10">
          {/* Success card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-navy">Client Created Successfully</h2>
            </div>

            <p className="text-gray-600 mb-6">
              <strong>{created.client.name}</strong> has been added to the CRM. Share the login credentials below with the client.
            </p>

            {/* Credentials box */}
            <div className="bg-navy-50 border border-navy-200 rounded-lg p-5 mb-6">
              <h3 className="text-sm font-medium text-navy-400 uppercase tracking-wider mb-3">
                Login Credentials
              </h3>
              <div className="space-y-2 font-mono text-sm">
                <div>
                  <span className="text-gray-500">Email:</span>{' '}
                  <span className="text-navy font-semibold">{created.credentials.email}</span>
                </div>
                <div>
                  <span className="text-gray-500">Password:</span>{' '}
                  <span className="text-navy font-semibold">{created.credentials.password}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={copyCredentials}
                className="px-5 py-2.5 bg-gold text-navy font-medium rounded-lg hover:bg-gold-300 transition-colors text-sm"
              >
                {copied ? 'Copied!' : 'Copy Credentials'}
              </button>

              <Link
                href={`/admin/clients/${created.client.id}?tab=overview`}
                className="px-5 py-2.5 bg-navy text-white font-medium rounded-lg hover:bg-navy-400 transition-colors text-sm"
              >
                Set KPIs
              </Link>

              <Link
                href="/admin"
                className="px-5 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors text-sm"
              >
                Back to Command Centre
              </Link>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // Form state
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-navy text-white px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">North Star Ventures</h1>
          <Link
            href="/admin"
            className="text-sm text-gold hover:text-gold-200 transition-colors"
          >
            Back to Command Centre
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-bold text-navy mb-1">Create New Client</h2>
        <p className="text-gray-500 mb-8">Set up a new client account with login credentials and optional Meta integrations.</p>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 space-y-6">
          {/* Client Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1.5">
              Client Name <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Corp"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gold/50 focus:border-gold outline-none transition-colors"
            />
          </div>

          {/* Client Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
              Client Email <span className="text-red-500">*</span>
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@example.com"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gold/50 focus:border-gold outline-none transition-colors"
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
              Password <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                id="password"
                type="text"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-gold/50 focus:border-gold outline-none transition-colors"
              />
              <button
                type="button"
                onClick={regeneratePassword}
                className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium whitespace-nowrap"
              >
                Regenerate
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Auto-generated 16-character password. You can edit it manually.</p>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 pt-2">
            <p className="text-sm font-medium text-gray-500">Meta Integration (Optional)</p>
          </div>

          {/* Meta Ad Account ID */}
          <div>
            <label htmlFor="meta_ad_account_id" className="block text-sm font-medium text-gray-700 mb-1.5">
              Meta Ad Account ID
            </label>
            <input
              id="meta_ad_account_id"
              type="text"
              value={metaAdAccountId}
              onChange={(e) => setMetaAdAccountId(e.target.value)}
              placeholder="act_123456789"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gold/50 focus:border-gold outline-none transition-colors"
            />
          </div>

          {/* Meta Access Token */}
          <div>
            <label htmlFor="meta_access_token" className="block text-sm font-medium text-gray-700 mb-1.5">
              Meta Access Token
            </label>
            <input
              id="meta_access_token"
              type="text"
              value={metaAccessToken}
              onChange={(e) => setMetaAccessToken(e.target.value)}
              placeholder="EAAx..."
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gold/50 focus:border-gold outline-none transition-colors"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gold text-navy font-semibold rounded-lg hover:bg-gold-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Creating Client...' : 'Create Client'}
          </button>
        </form>
      </main>
    </div>
  )
}
