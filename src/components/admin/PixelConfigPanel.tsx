'use client'

import { useState, useEffect, useCallback } from 'react'

/* ---------- types ---------- */
interface StageEventEntry {
  event: string
  enabled: boolean
}

interface StageEventMap {
  stage_booked: StageEventEntry
  stage_won: StageEventEntry
  stage_qualified: StageEventEntry
  stage_lost: StageEventEntry
  quality_good: StageEventEntry
  quality_bad: StageEventEntry
}

type StageEventKey = keyof StageEventMap

const META_EVENTS = [
  'Lead',
  'CompleteRegistration',
  'Schedule',
  'Purchase',
  'Contact',
  'Subscribe',
  'ViewContent',
  'InitiateCheckout',
] as const

const TRIGGER_LABELS: Record<StageEventKey, string> = {
  stage_booked: 'Stage \u2192 Booked',
  stage_won: 'Stage \u2192 Won',
  stage_qualified: 'Stage \u2192 Qualified',
  stage_lost: 'Stage \u2192 Lost',
  quality_good: 'Lead Quality \u2192 Good',
  quality_bad: 'Lead Quality \u2192 Bad',
}

const DEFAULT_MAP: StageEventMap = {
  stage_booked: { event: 'Schedule', enabled: true },
  stage_won: { event: 'Purchase', enabled: true },
  stage_qualified: { event: 'Contact', enabled: false },
  stage_lost: { event: '', enabled: false },
  quality_good: { event: 'Lead', enabled: true },
  quality_bad: { event: '', enabled: false },
}

const STAGE_KEYS: StageEventKey[] = [
  'stage_booked',
  'stage_won',
  'stage_qualified',
  'stage_lost',
  'quality_good',
  'quality_bad',
]

/* ---------- toggle component ---------- */
function Toggle({
  enabled,
  onChange,
}: {
  enabled: boolean
  onChange: (val: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gold/50 focus:ring-offset-1 focus:ring-offset-dark ${
        enabled ? 'bg-gold' : 'bg-dark-elevated'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

/* ---------- event selector component ---------- */
function EventSelector({
  value,
  onChange,
}: {
  value: string
  onChange: (val: string) => void
}) {
  const isStandard = META_EVENTS.includes(value as (typeof META_EVENTS)[number])
  const isOther = value !== '' && !isStandard
  const [showCustom, setShowCustom] = useState(isOther)
  const [customValue, setCustomValue] = useState(isOther ? value : '')

  // Keep custom value in sync when parent value changes externally
  useEffect(() => {
    const standard = META_EVENTS.includes(value as (typeof META_EVENTS)[number])
    if (!standard && value !== '') {
      setShowCustom(true)
      setCustomValue(value)
    } else {
      setShowCustom(false)
    }
  }, [value])

  const selectValue = isOther ? '__other__' : value

  return (
    <div className="flex flex-col gap-1.5">
      <select
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value
          if (v === '__other__') {
            setShowCustom(true)
            onChange(customValue || '')
          } else {
            setShowCustom(false)
            setCustomValue('')
            onChange(v)
          }
        }}
        className="w-full px-3 py-2 border border-dark-border rounded-lg text-sm bg-dark-elevated text-text-primary focus:ring-2 focus:ring-gold/50 focus:border-gold outline-none transition-all duration-200"
      >
        <option value="">-- Select event --</option>
        {META_EVENTS.map((evt) => (
          <option key={evt} value={evt}>
            {evt}
          </option>
        ))}
        <option value="__other__">Other...</option>
      </select>
      {showCustom && (
        <input
          type="text"
          value={customValue}
          onChange={(e) => {
            setCustomValue(e.target.value)
            onChange(e.target.value)
          }}
          placeholder="Custom event name"
          className="w-full px-3 py-2 border border-dark-border rounded-lg text-sm bg-dark-elevated text-text-primary placeholder-text-muted focus:ring-2 focus:ring-gold/50 focus:border-gold outline-none transition-all duration-200"
        />
      )}
    </div>
  )
}

/* ---------- main component ---------- */
export default function PixelConfigPanel({ clientId }: { clientId: string }) {
  const [pixelId, setPixelId] = useState('')
  const [capiToken, setCapiToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [stageEventMap, setStageEventMap] = useState<StageEventMap>(DEFAULT_MAP)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  /* fetch existing config */
  const fetchConfig = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/pixel-config/${clientId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.pixel_id) setPixelId(data.pixel_id)
        if (data.capi_access_token) setCapiToken(data.capi_access_token)
        if (data.stage_event_map) {
          setStageEventMap((prev) => ({ ...prev, ...data.stage_event_map }))
        }
      }
    } catch {
      // no existing config — use defaults
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  /* save config */
  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      const res = await fetch(`/api/admin/pixel-config/${clientId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pixel_id: pixelId,
          capi_access_token: capiToken,
          stage_event_map: stageEventMap,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save configuration')
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setSaving(false)
    }
  }

  /* test connection */
  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(`/api/admin/pixel-config/${clientId}/test`, {
        method: 'POST',
      })
      const data = await res.json()
      if (res.ok) {
        setTestResult({ ok: true, message: data.message || 'Test event sent successfully.' })
      } else {
        setTestResult({ ok: false, message: data.error || 'Test failed.' })
      }
    } catch {
      setTestResult({ ok: false, message: 'Network error. Could not reach the server.' })
    } finally {
      setTesting(false)
    }
  }

  /* update a single entry in the stage event map */
  function updateMapEntry(key: StageEventKey, patch: Partial<StageEventEntry>) {
    setStageEventMap((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }))
  }

  /* loading state */
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8">
        <div className="w-5 h-5 border-2 border-gold border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-text-secondary">Loading pixel configuration...</span>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h3 className="text-lg font-heading font-semibold text-text-primary mb-1">Meta Pixel Configuration</h3>
        <p className="text-sm text-text-secondary">
          Configure the Meta Pixel and Conversions API integration for this client. Map CRM stages and lead quality changes to Meta events.
        </p>
      </div>

      {/* Pixel ID & CAPI Token */}
      <div className="bg-dark-card rounded-lg shadow-gold-sm border border-dark-border p-6 space-y-5">
        <div>
          <label htmlFor="pixel_id" className="block text-sm font-medium text-text-secondary mb-1.5">
            Pixel ID
          </label>
          <input
            id="pixel_id"
            type="text"
            value={pixelId}
            onChange={(e) => setPixelId(e.target.value)}
            placeholder="e.g. 123456789012345"
            className="w-full px-4 py-2.5 border border-dark-border rounded-lg bg-dark-elevated text-text-primary placeholder-text-muted focus:ring-2 focus:ring-gold/50 focus:border-gold outline-none transition-all duration-200"
          />
        </div>

        <div>
          <label htmlFor="capi_token" className="block text-sm font-medium text-text-secondary mb-1.5">
            Conversions API Access Token
          </label>
          <div className="relative">
            <input
              id="capi_token"
              type={showToken ? 'text' : 'password'}
              value={capiToken}
              onChange={(e) => setCapiToken(e.target.value)}
              placeholder="EAAxxxxxxx..."
              className="w-full px-4 py-2.5 pr-12 border border-dark-border rounded-lg bg-dark-elevated text-text-primary placeholder-text-muted focus:ring-2 focus:ring-gold/50 focus:border-gold outline-none transition-all duration-200"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-all duration-200"
              aria-label={showToken ? 'Hide token' : 'Show token'}
            >
              {showToken ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l18 18" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Stage & Quality Event Mapper */}
      <div className="bg-dark-card rounded-lg shadow-gold-sm border border-dark-border overflow-hidden">
        <div className="px-6 py-4 border-b border-dark-border">
          <h4 className="text-sm font-heading font-semibold text-text-primary">Stage &amp; Quality Event Mapper</h4>
          <p className="text-xs text-text-secondary mt-0.5">
            Map CRM pipeline stages and lead quality changes to Meta conversion events.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-dark-stripe border-b border-dark-border">
                <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-6 py-3">
                  Trigger
                </th>
                <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-6 py-3">
                  Meta Event
                </th>
                <th className="text-center text-xs font-semibold text-text-muted uppercase tracking-wider px-6 py-3">
                  Enabled
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border">
              {STAGE_KEYS.map((key) => (
                <tr key={key} className="hover:bg-dark-elevated transition-all duration-200">
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-text-primary">{TRIGGER_LABELS[key]}</span>
                  </td>
                  <td className="px-6 py-4 min-w-[220px]">
                    <EventSelector
                      value={stageEventMap[key].event}
                      onChange={(event) => updateMapEntry(key, { event })}
                    />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Toggle
                      enabled={stageEventMap[key].enabled}
                      onChange={(enabled) => updateMapEntry(key, { enabled })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Feedback messages */}
      {saveError && (
        <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm">
          {saveError}
        </div>
      )}

      {saved && (
        <div className="bg-success/10 border border-success/30 text-success px-4 py-3 rounded-lg text-sm">
          Pixel configuration saved successfully.
        </div>
      )}

      {testResult && (
        <div
          className={`px-4 py-3 rounded-lg text-sm border ${
            testResult.ok
              ? 'bg-success/10 border-success/30 text-success'
              : 'bg-danger/10 border-danger/30 text-danger'
          }`}
        >
          {testResult.message}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-gold text-dark font-bold rounded-lg hover:bg-gold-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm"
        >
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save Configuration'}
        </button>

        <button
          type="button"
          onClick={handleTest}
          disabled={testing || !pixelId || !capiToken}
          className="px-6 py-2.5 border border-gold text-gold font-semibold rounded-lg hover:bg-gold hover:text-dark disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm"
        >
          {testing ? 'Sending...' : 'Test Connection'}
        </button>
      </div>
    </div>
  )
}
