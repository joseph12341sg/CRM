'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import PixelConfigPanel from '@/components/admin/PixelConfigPanel'

/* ---------- types ---------- */
interface ClientData {
  id: string
  name: string
  email: string
  meta_ad_account_id?: string | null
  meta_access_token?: string | null
  lead_sms_number?: string | null
  lead_sms_enabled?: boolean
}

interface KpiData {
  client_id: string
  max_cpl: number | null
  min_roas: number | null
  min_leads_per_day: number | null
  min_ctr: number | null
  monthly_budget: number | null
  min_cac: number | null
}

type TabKey =
  | 'overview'
  | 'ad-library'
  | 'meta-dashboard'
  | 'pipeline'
  | 'contacts'
  | 'notes-tasks'
  | 'pixel-config'

interface Tab {
  key: TabKey
  label: string
  icon: React.ReactNode
}

/* ---------- tab definitions ---------- */
const tabs: Tab[] = [
  {
    key: 'overview',
    label: 'Overview',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
      </svg>
    ),
  },
  {
    key: 'ad-library',
    label: 'Ad Library',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    key: 'meta-dashboard',
    label: 'Meta Dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    key: 'pipeline',
    label: 'Pipeline',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
      </svg>
    ),
  },
  {
    key: 'contacts',
    label: 'Contacts',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    key: 'notes-tasks',
    label: 'Notes & Tasks',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    key: 'pixel-config',
    label: 'Pixel Config',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
]

/* ---------- KPI form component ---------- */
function KpiForm({ clientId }: { clientId: string }) {
  const [kpis, setKpis] = useState<KpiData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [maxCpl, setMaxCpl] = useState('')
  const [minRoas, setMinRoas] = useState('')
  const [minLeadsPerDay, setMinLeadsPerDay] = useState('')
  const [minCtr, setMinCtr] = useState('')
  const [monthlyBudget, setMonthlyBudget] = useState('')
  const [minCac, setMinCac] = useState('')

  const fetchKpis = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/set-kpis?client_id=${clientId}`)
      const data = await res.json()
      if (data.kpis) {
        setKpis(data.kpis)
        setMaxCpl(data.kpis.max_cpl?.toString() ?? '')
        setMinRoas(data.kpis.min_roas?.toString() ?? '')
        setMinLeadsPerDay(data.kpis.min_leads_per_day?.toString() ?? '')
        setMinCtr(data.kpis.min_ctr?.toString() ?? '')
        setMonthlyBudget(data.kpis.monthly_budget?.toString() ?? '')
        setMinCac(data.kpis.min_cac?.toString() ?? '')
      }
    } catch {
      setError('Failed to load KPIs')
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    fetchKpis()
  }, [fetchKpis])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      const res = await fetch('/api/admin/set-kpis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          max_cpl: maxCpl ? parseFloat(maxCpl) : null,
          min_roas: minRoas ? parseFloat(minRoas) : null,
          min_leads_per_day: minLeadsPerDay ? parseInt(minLeadsPerDay, 10) : null,
          min_ctr: minCtr ? parseFloat(minCtr) : null,
          monthly_budget: monthlyBudget ? parseFloat(monthlyBudget) : null,
          min_cac: minCac ? parseFloat(minCac) : null,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save KPIs')

      setKpis(data.kpis)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8">
        <div className="w-5 h-5 border-2 border-gold border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-text-muted font-body">Loading KPIs...</span>
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="max_cpl" className="block text-sm font-medium text-text-secondary mb-1.5 font-body">
            Max CPL ($)
          </label>
          <input
            id="max_cpl"
            type="number"
            step="0.01"
            value={maxCpl}
            onChange={(e) => setMaxCpl(e.target.value)}
            placeholder="e.g. 25.00"
            className="w-full px-4 py-2.5 bg-dark-elevated border border-dark-border rounded-lg text-text-primary placeholder-text-muted focus:ring-2 focus:ring-gold focus:border-gold outline-none transition-all duration-200 font-body"
          />
        </div>

        <div>
          <label htmlFor="min_roas" className="block text-sm font-medium text-text-secondary mb-1.5 font-body">
            Min ROAS
          </label>
          <input
            id="min_roas"
            type="number"
            step="0.01"
            value={minRoas}
            onChange={(e) => setMinRoas(e.target.value)}
            placeholder="e.g. 3.5"
            className="w-full px-4 py-2.5 bg-dark-elevated border border-dark-border rounded-lg text-text-primary placeholder-text-muted focus:ring-2 focus:ring-gold focus:border-gold outline-none transition-all duration-200 font-body"
          />
        </div>

        <div>
          <label htmlFor="min_leads" className="block text-sm font-medium text-text-secondary mb-1.5 font-body">
            Min Leads / Day
          </label>
          <input
            id="min_leads"
            type="number"
            step="1"
            value={minLeadsPerDay}
            onChange={(e) => setMinLeadsPerDay(e.target.value)}
            placeholder="e.g. 10"
            className="w-full px-4 py-2.5 bg-dark-elevated border border-dark-border rounded-lg text-text-primary placeholder-text-muted focus:ring-2 focus:ring-gold focus:border-gold outline-none transition-all duration-200 font-body"
          />
        </div>

        <div>
          <label htmlFor="min_ctr" className="block text-sm font-medium text-text-secondary mb-1.5 font-body">
            Min CTR (%)
          </label>
          <input
            id="min_ctr"
            type="number"
            step="0.01"
            value={minCtr}
            onChange={(e) => setMinCtr(e.target.value)}
            placeholder="e.g. 1.5"
            className="w-full px-4 py-2.5 bg-dark-elevated border border-dark-border rounded-lg text-text-primary placeholder-text-muted focus:ring-2 focus:ring-gold focus:border-gold outline-none transition-all duration-200 font-body"
          />
        </div>

        <div>
          <label htmlFor="monthly_budget" className="block text-sm font-medium text-text-secondary mb-1.5 font-body">
            Monthly Budget ($)
          </label>
          <input
            id="monthly_budget"
            type="number"
            step="0.01"
            value={monthlyBudget}
            onChange={(e) => setMonthlyBudget(e.target.value)}
            placeholder="e.g. 5000.00"
            className="w-full px-4 py-2.5 bg-dark-elevated border border-dark-border rounded-lg text-text-primary placeholder-text-muted focus:ring-2 focus:ring-gold focus:border-gold outline-none transition-all duration-200 font-body"
          />
        </div>

        <div>
          <label htmlFor="min_cac" className="block text-sm font-medium text-text-secondary mb-1.5 font-body">
            Max CAC (&pound;)
          </label>
          <input
            id="min_cac"
            type="number"
            step="0.01"
            value={minCac}
            onChange={(e) => setMinCac(e.target.value)}
            placeholder="e.g. 50.00"
            className="w-full px-4 py-2.5 bg-dark-elevated border border-dark-border rounded-lg text-text-primary placeholder-text-muted focus:ring-2 focus:ring-gold focus:border-gold outline-none transition-all duration-200 font-body"
          />
        </div>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/20 text-danger px-4 py-3 rounded-lg text-sm font-body">
          {error}
        </div>
      )}

      {saved && (
        <div className="bg-success/10 border border-success/20 text-success px-4 py-3 rounded-lg text-sm font-body">
          KPIs saved successfully.
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="px-6 py-2.5 bg-gold text-dark font-bold rounded-lg hover:bg-gold-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm"
      >
        {saving ? 'Saving...' : kpis ? 'Update KPIs' : 'Set KPIs'}
      </button>
    </form>
  )
}

/* ---------- placeholder for future tab content ---------- */
function TabPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-dark-elevated flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-text-primary mb-1 font-heading">{label}</h3>
      <p className="text-sm text-text-secondary max-w-sm font-body">
        This section is coming soon. The {label.toLowerCase()} module will be built out in a future update.
      </p>
    </div>
  )
}

/* ---------- main page component ---------- */
export default function ClientAdminPage() {
  const params = useParams()
  const clientId = params.id as string
  const router = useRouter()

  const supabase = createClient()

  const [client, setClient] = useState<ClientData | null>(null)
  const [checklist, setChecklist] = useState<Record<string, boolean> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('overview')

  // Client switcher state
  const [allClients, setAllClients] = useState<{ id: string; name: string; health_status: string }[]>([])
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle')

  // Read initial tab from URL search params
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const tab = searchParams.get('tab') as TabKey | null
    if (tab && tabs.some((t) => t.key === tab)) {
      setActiveTab(tab)
    }
  }, [])

  // Fetch client data
  const fetchClient = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('clients')
        .select('id, name, email, meta_ad_account_id, meta_access_token, lead_sms_number, lead_sms_enabled')
        .eq('id', clientId)
        .single()

      if (fetchError) throw new Error(fetchError.message)
      if (!data) throw new Error('Client not found')

      setClient(data)

      // Fetch checklist
      const { data: clData } = await supabase
        .from('client_checklist')
        .select('*')
        .eq('client_id', clientId)
        .single()

      // Fetch pixel config for auto-check
      const { data: pixelConfig } = await supabase
        .from('client_pixel_config')
        .select('pixel_id, capi_access_token')
        .eq('client_id', clientId)
        .single()

      // Compute auto-checks
      const autoApi = !!data.meta_access_token
      const autoPixel = !!(pixelConfig?.pixel_id && pixelConfig?.capi_access_token)
      const autoLead = !!data.lead_sms_number

      // If any auto-check differs from stored value, update
      if (clData && (clData.api_set_up !== autoApi || clData.pixel_set_up !== autoPixel || clData.lead_notification_set_up !== autoLead)) {
        await supabase.from('client_checklist').update({
          api_set_up: autoApi,
          pixel_set_up: autoPixel,
          lead_notification_set_up: autoLead,
          updated_at: new Date().toISOString(),
        }).eq('client_id', clientId)
      }

      if (clData) {
        setChecklist({
          business_manager_connected: clData.business_manager_connected,
          connected_to_ad_manager: clData.connected_to_ad_manager,
          ad_created: clData.ad_created,
          ads_scheduled: clData.ads_scheduled,
          api_set_up: autoApi,
          pixel_set_up: autoPixel,
          lead_notification_set_up: autoLead,
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load client')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  useEffect(() => {
    fetchClient()
  }, [fetchClient])

  /* ---------- checklist toggle ---------- */
  const toggleChecklistItem = async (key: string) => {
    if (!checklist) return
    const newValue = !checklist[key]
    setChecklist({ ...checklist, [key]: newValue })
    await supabase.from('client_checklist').update({
      [key]: newValue,
      updated_at: new Date().toISOString(),
    }).eq('client_id', clientId)
  }

  /* ---------- fetch all clients for switcher ---------- */
  useEffect(() => {
    async function fetchClientsList() {
      try {
        const res = await fetch('/api/admin/clients-list')
        const json = await res.json()
        if (json.clients) setAllClients(json.clients)
      } catch { /* ignore */ }
    }
    fetchClientsList()
  }, [])

  const currentIndex = allClients.findIndex(c => c.id === clientId)
  const prevClient = currentIndex > 0 ? allClients[currentIndex - 1] : null
  const nextClient = currentIndex < allClients.length - 1 ? allClients[currentIndex + 1] : null

  /* ---------- run sync now ---------- */
  const handleSync = async () => {
    setSyncStatus('syncing')
    try {
      const res = await fetch('/api/cron/meta-sync-single', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          },
        body: JSON.stringify({ client_id: clientId }),
      })
      setSyncStatus(res.ok ? 'success' : 'error')
      setTimeout(() => setSyncStatus('idle'), 3000)
    } catch {
      setSyncStatus('error')
      setTimeout(() => setSyncStatus('idle'), 3000)
    }
  }

  /* ---------- loading state ---------- */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-dark">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-gold border-t-transparent rounded-full animate-spin" />
          <p className="text-text-muted text-sm font-body">Loading client...</p>
        </div>
      </div>
    )
  }

  /* ---------- error state ---------- */
  if (error || !client) {
    return (
      <div className="flex items-center justify-center h-screen bg-dark">
        <div className="bg-dark-card rounded-lg shadow-gold-sm border border-dark-border p-8 max-w-md text-center">
          <div className="w-12 h-12 rounded-full bg-danger/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-text-primary mb-2 font-heading">Failed to Load Client</h2>
          <p className="text-sm text-text-secondary mb-6 font-body">{error || 'Client not found.'}</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={fetchClient}
              className="px-5 py-2.5 bg-gold text-dark font-bold rounded-lg hover:bg-gold-hover transition-all duration-200 text-sm"
            >
              Retry
            </button>
            <Link
              href="/admin"
              className="px-5 py-2.5 border border-dark-border text-text-secondary font-medium rounded-lg hover:bg-dark-elevated transition-all duration-200 text-sm"
            >
              Back to Command Centre
            </Link>
          </div>
        </div>
      </div>
    )
  }

  /* ---------- render tab content ---------- */
  function renderTabContent() {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-text-primary mb-1 font-heading">Client KPIs</h3>
              <p className="text-sm text-text-secondary mb-6 font-body">
                Set performance thresholds for {client!.name}. These are used to calculate health status and trigger alerts.
              </p>
              <div className="bg-dark-card rounded-lg shadow-gold-sm border border-dark-border p-6">
                <KpiForm clientId={clientId} />
              </div>
            </div>

            <div className="mt-6">
              <h3 className="text-lg font-semibold text-text-primary mb-1 font-heading">Lead Notifications</h3>
              <p className="text-sm text-text-secondary mb-4 font-body">Configure SMS notifications for new leads.</p>
              <div className="bg-dark-card rounded-lg shadow-gold-sm border border-dark-border p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5 font-body">SMS Number</label>
                  <input
                    type="tel"
                    value={client!.lead_sms_number ?? ''}
                    onChange={(e) => setClient(prev => prev ? {...prev, lead_sms_number: e.target.value} : prev)}
                    placeholder="+44 7700 900000"
                    className="w-full px-4 py-2.5 bg-dark-elevated border border-dark-border rounded-lg text-text-primary placeholder-text-muted focus:ring-2 focus:ring-gold focus:border-gold outline-none transition-all duration-200 font-body"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setClient(prev => prev ? {...prev, lead_sms_enabled: !prev.lead_sms_enabled} : prev)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      client!.lead_sms_enabled ? 'bg-gold' : 'bg-dark-elevated'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      client!.lead_sms_enabled ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                  <span className="text-sm text-text-secondary font-body">Enable SMS notifications</span>
                </div>
                <button
                  onClick={async () => {
                    await supabase.from('clients').update({
                      lead_sms_number: client!.lead_sms_number,
                      lead_sms_enabled: client!.lead_sms_enabled,
                    }).eq('id', clientId);
                  }}
                  className="px-5 py-2.5 bg-gold text-dark font-bold rounded-lg hover:bg-gold-hover transition-all duration-200 text-sm"
                >
                  Save Notification Settings
                </button>
              </div>
            </div>
          </div>
        )
      case 'ad-library':
        return <TabPlaceholder label="Ad Library" />
      case 'meta-dashboard':
        return <TabPlaceholder label="Meta Dashboard" />
      case 'pipeline':
        return <TabPlaceholder label="Pipeline" />
      case 'contacts':
        return <TabPlaceholder label="Contacts" />
      case 'notes-tasks':
        return <TabPlaceholder label="Notes & Tasks" />
      case 'pixel-config':
        return <PixelConfigPanel clientId={clientId} />
      default:
        return null
    }
  }

  /* ---------- main render ---------- */
  return (
    <div className="min-h-screen flex flex-col bg-dark">
      {/* Admin banner with client switcher */}
      <div className="bg-dark-nav text-text-primary px-6 py-3 flex items-center justify-between flex-shrink-0 border-b border-dark-border">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-gold animate-pulse" />
          <span className="text-sm font-medium font-body">Viewing as admin &mdash;</span>

          {/* Previous arrow */}
          <button
            onClick={() => prevClient && router.push(`/admin/clients/${prevClient.id}`)}
            disabled={!prevClient}
            className="p-1 rounded hover:bg-dark-elevated disabled:opacity-30 transition-all duration-200"
            title="Previous client"
          >
            <svg className="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Client switcher dropdown */}
          <select
            value={clientId}
            onChange={(e) => router.push(`/admin/clients/${e.target.value}`)}
            className="bg-dark-elevated border border-dark-border rounded-lg px-3 py-1.5 text-sm text-gold font-semibold focus:ring-2 focus:ring-gold focus:border-gold outline-none transition-all duration-200 max-w-[200px]"
          >
            {allClients.map(c => (
              <option key={c.id} value={c.id}>
                {c.health_status === 'critical' ? '🔴 ' : c.health_status === 'warning' ? '🟡 ' : '🟢 '}{c.name}
              </option>
            ))}
          </select>

          {/* Next arrow */}
          <button
            onClick={() => nextClient && router.push(`/admin/clients/${nextClient.id}`)}
            disabled={!nextClient}
            className="p-1 rounded hover:bg-dark-elevated disabled:opacity-30 transition-all duration-200"
            title="Next client"
          >
            <svg className="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Run sync now */}
          <button
            onClick={handleSync}
            disabled={syncStatus === 'syncing'}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-dark-border text-text-secondary hover:border-gold hover:text-gold transition-all duration-200 disabled:opacity-50 flex items-center gap-1.5"
          >
            {syncStatus === 'syncing' && (
              <span className="w-3 h-3 border-2 border-gold border-t-transparent rounded-full animate-spin" />
            )}
            {syncStatus === 'success' ? (
              <span className="text-success">Synced</span>
            ) : syncStatus === 'error' ? (
              <span className="text-danger">Sync failed</span>
            ) : syncStatus === 'syncing' ? (
              'Syncing...'
            ) : (
              'Run sync now'
            )}
          </button>

          <Link
            href="/admin"
            className="text-sm text-gold hover:text-gold-hover transition-all duration-200 font-medium"
          >
            Back to Command Centre
          </Link>
        </div>
      </div>

      {/* Onboarding Checklist */}
      {checklist && (
        <div className="bg-dark-card border-b border-dark-border px-6 py-4">
          <div className="flex items-center gap-6 overflow-x-auto">
            {[
              { key: 'business_manager_connected', label: 'Business Manager connected', auto: false },
              { key: 'connected_to_ad_manager', label: 'Connected to ad manager', auto: false },
              { key: 'ad_created', label: 'Ad created', auto: false },
              { key: 'ads_scheduled', label: 'Ads scheduled', auto: false },
              { key: 'api_set_up', label: 'API set up', auto: true },
              { key: 'pixel_set_up', label: 'Pixel set up', auto: true },
              { key: 'lead_notification_set_up', label: 'Lead notification set up', auto: true },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => !item.auto && toggleChecklistItem(item.key)}
                disabled={item.auto}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  checklist[item.key]
                    ? 'bg-success/10 text-success border border-success/20'
                    : 'bg-dark-elevated text-text-secondary border border-dark-border hover:border-gold/50'
                } ${item.auto ? 'cursor-default opacity-80' : 'cursor-pointer'}`}
              >
                <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${
                  checklist[item.key] ? 'bg-success' : 'border border-dark-border bg-dark-elevated'
                }`}>
                  {checklist[item.key] && (
                    <svg className="w-3 h-3 text-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                {item.label}
                {item.auto && <span className="text-xs text-text-muted">(auto)</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar tabs */}
        <aside className="w-56 bg-dark-card border-r border-dark-border flex-shrink-0 overflow-y-auto">
          <nav className="py-4">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`w-full flex items-center gap-3 px-5 py-3 text-sm font-medium transition-all duration-200 text-left ${
                  activeTab === tab.key
                    ? 'bg-gold/10 text-gold border-r-2 border-gold'
                    : 'text-text-secondary hover:bg-dark-elevated hover:text-text-primary'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-8 bg-dark">
          {renderTabContent()}
        </main>
      </div>
    </div>
  )
}
