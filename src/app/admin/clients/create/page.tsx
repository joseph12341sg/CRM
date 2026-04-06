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
  const [leadSmsNumber, setLeadSmsNumber] = useState('')
  const [leadSmsEnabled, setLeadSmsEnabled] = useState(false)

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
          lead_sms_number: leadSmsNumber || undefined,
          lead_sms_enabled: leadSmsEnabled,
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
      <div className="min-h-screen bg-dark">
        {/* Header */}
        <header className="bg-dark-nav text-text-primary px-6 py-4 border-b border-dark-border">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <h1 className="text-lg font-semibold tracking-tight font-heading">North Star Ventures</h1>
            <Link
              href="/admin"
              className="text-sm text-gold hover:text-gold-hover transition-all duration-200"
            >
              Back to Command Centre
            </Link>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-6 py-10">
          {/* Success card */}
          <div className="bg-dark-card rounded-lg shadow-gold-sm border border-dark-border p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-full bg-success/20 flex items-center justify-center">
                <svg className="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-text-primary font-heading">Client Created Successfully</h2>
            </div>

            <p className="text-text-secondary mb-6 font-body">
              <strong className="text-text-primary">{created.client.name}</strong> has been added to the CRM. Share the login credentials below with the client.
            </p>

            {/* Credentials box */}
            <div className="bg-dark-elevated border border-dark-border rounded-lg p-5 mb-6">
              <h3 className="text-sm font-medium text-text-muted uppercase tracking-wider mb-3 font-heading">
                Login Credentials
              </h3>
              <div className="space-y-2 font-mono text-sm">
                <div>
                  <span className="text-text-muted">Email:</span>{' '}
                  <span className="text-gold font-semibold">{created.credentials.email}</span>
                </div>
                <div>
                  <span className="text-text-muted">Password:</span>{' '}
                  <span className="text-gold font-semibold">{created.credentials.password}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={copyCredentials}
                className="px-5 py-2.5 bg-gold text-dark font-bold rounded-lg hover:bg-gold-hover transition-all duration-200 text-sm"
              >
                {copied ? 'Copied!' : 'Copy Credentials'}
              </button>

              <Link
                href={`/admin/clients/${created.client.id}?tab=overview`}
                className="px-5 py-2.5 border border-gold text-gold font-medium rounded-lg hover:bg-gold hover:text-dark transition-all duration-200 text-sm"
              >
                Set KPIs
              </Link>

              <Link
                href="/admin"
                className="px-5 py-2.5 border border-dark-border text-text-secondary font-medium rounded-lg hover:bg-dark-elevated transition-all duration-200 text-sm"
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
    <div className="min-h-screen bg-dark">
      {/* Header */}
      <header className="bg-dark-nav text-text-primary px-6 py-4 border-b border-dark-border">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight font-heading">North Star Ventures</h1>
          <Link
            href="/admin"
            className="text-sm text-gold hover:text-gold-hover transition-all duration-200"
          >
            Back to Command Centre
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-bold text-text-primary mb-1 font-heading">Create New Client</h2>
        <p className="text-text-secondary mb-8 font-body">Set up a new client account with login credentials and optional Meta integrations.</p>

        <form onSubmit={handleSubmit} className="bg-dark-card rounded-lg shadow-gold-sm border border-dark-border p-8 space-y-6">
          {/* Client Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-text-secondary mb-1.5 font-body">
              Client Name <span className="text-danger">*</span>
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Corp"
              className="w-full px-4 py-2.5 bg-dark-elevated border border-dark-border rounded-lg text-text-primary placeholder-text-muted focus:ring-2 focus:ring-gold focus:border-gold outline-none transition-all duration-200 font-body"
            />
          </div>

          {/* Client Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-1.5 font-body">
              Client Email <span className="text-danger">*</span>
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@example.com"
              className="w-full px-4 py-2.5 bg-dark-elevated border border-dark-border rounded-lg text-text-primary placeholder-text-muted focus:ring-2 focus:ring-gold focus:border-gold outline-none transition-all duration-200 font-body"
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-text-secondary mb-1.5 font-body">
              Password <span className="text-danger">*</span>
            </label>
            <div className="flex gap-2">
              <input
                id="password"
                type="text"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1 px-4 py-2.5 bg-dark-elevated border border-dark-border rounded-lg font-mono text-sm text-text-primary focus:ring-2 focus:ring-gold focus:border-gold outline-none transition-all duration-200"
              />
              <button
                type="button"
                onClick={regeneratePassword}
                className="px-4 py-2.5 bg-dark-elevated text-text-secondary rounded-lg hover:bg-dark-border transition-all duration-200 text-sm font-medium whitespace-nowrap border border-dark-border"
              >
                Regenerate
              </button>
            </div>
            <p className="text-xs text-text-muted mt-1 font-body">Auto-generated 16-character password. You can edit it manually.</p>
          </div>

          {/* Divider */}
          <div className="border-t border-dark-border pt-2">
            <p className="text-sm font-medium text-text-muted font-body">Meta Integration (Optional)</p>
          </div>

          {/* Meta Ad Account ID */}
          <div>
            <label htmlFor="meta_ad_account_id" className="block text-sm font-medium text-text-secondary mb-1.5 font-body">
              Meta Ad Account ID
            </label>
            <input
              id="meta_ad_account_id"
              type="text"
              value={metaAdAccountId}
              onChange={(e) => setMetaAdAccountId(e.target.value)}
              placeholder="act_123456789"
              className="w-full px-4 py-2.5 bg-dark-elevated border border-dark-border rounded-lg text-text-primary placeholder-text-muted focus:ring-2 focus:ring-gold focus:border-gold outline-none transition-all duration-200 font-body"
            />
          </div>

          {/* Meta Access Token */}
          <div>
            <label htmlFor="meta_access_token" className="block text-sm font-medium text-text-secondary mb-1.5 font-body">
              Meta Access Token
            </label>
            <input
              id="meta_access_token"
              type="text"
              value={metaAccessToken}
              onChange={(e) => setMetaAccessToken(e.target.value)}
              placeholder="EAAx..."
              className="w-full px-4 py-2.5 bg-dark-elevated border border-dark-border rounded-lg text-text-primary placeholder-text-muted focus:ring-2 focus:ring-gold focus:border-gold outline-none transition-all duration-200 font-body"
            />
          </div>

          {/* Divider */}
          <div className="border-t border-dark-border pt-2">
            <p className="text-sm font-medium text-text-muted font-body">Lead Notifications (Optional)</p>
          </div>

          {/* SMS Number */}
          <div>
            <label htmlFor="lead_sms_number" className="block text-sm font-medium text-text-secondary mb-1.5 font-body">
              SMS Notification Number
            </label>
            <input
              id="lead_sms_number"
              type="tel"
              value={leadSmsNumber}
              onChange={(e) => setLeadSmsNumber(e.target.value)}
              placeholder="+44 7700 900000"
              className="w-full px-4 py-2.5 bg-dark-elevated border border-dark-border rounded-lg text-text-primary placeholder-text-muted focus:ring-2 focus:ring-gold focus:border-gold outline-none transition-all duration-200 font-body"
            />
          </div>

          {/* SMS Enabled Toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setLeadSmsEnabled(!leadSmsEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                leadSmsEnabled ? 'bg-gold' : 'bg-dark-elevated'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                leadSmsEnabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
            <span className="text-sm text-text-secondary font-body">Enable SMS notifications for new leads</span>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-danger/10 border border-danger/20 text-danger px-4 py-3 rounded-lg text-sm font-body">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gold text-dark font-bold rounded-lg hover:bg-gold-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-body"
          >
            {loading ? 'Creating Client...' : 'Create Client'}
          </button>
        </form>
      </main>
    </div>
  )
}
