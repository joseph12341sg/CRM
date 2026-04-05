import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import puppeteer from 'puppeteer'

/* ------------------------------------------------------------------ */
/*  POST /api/reports/pdf                                              */
/*  Body: { from: string, to: string, client_id?: string }            */
/*  Returns a branded PDF performance report for the date range.       */
/* ------------------------------------------------------------------ */

// ── Constants ────────────────────────────────────────────────────────

const NAVY = '#0F1B2D'
const GOLD = '#C9A84C'

const STAGE_LABELS: Record<string, string> = {
  new_lead: 'New Lead',
  contacted: 'Contacted',
  qualified: 'Qualified',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  booked: 'Booked',
  won: 'Won',
  lost: 'Lost',
}

const STAGE_COLORS: Record<string, string> = {
  new_lead: '#3B82F6',
  contacted: '#EAB308',
  qualified: '#A855F7',
  proposal: '#F97316',
  negotiation: '#14B8A6',
  booked: '#06B6D4',
  won: '#22C55E',
  lost: '#EF4444',
}

// ── Helpers ──────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function fmtGBP(n: number): string {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPct(n: number): string {
  return `${n.toFixed(2)}%`
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function fmtDateShort(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function labelFor(stage: string): string {
  return (
    STAGE_LABELS[stage] ||
    stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  )
}

function colorFor(stage: string): string {
  return STAGE_COLORS[stage] || '#6B7280'
}

// ── Route Handler ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()

  // 1. Authenticate
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { from, to, client_id: bodyClientId } = body

  if (!from || !to) {
    return NextResponse.json(
      { error: 'from and to dates are required' },
      { status: 400 },
    )
  }

  // Determine client_id — admins may pass client_id to view a specific client
  const adminClient = createAdminClient()
  const { data: profile } = await adminClient
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  const clientId =
    profile?.is_admin && bodyClientId ? bodyClientId : user.id

  // ── 2. Fetch all data in parallel ──────────────────────────────────

  const [snapshotsRes, contactsRes, pipelineEventsRes, kpisRes, healthRes, clientRes] =
    await Promise.all([
      adminClient
        .from('meta_snapshots')
        .select('*')
        .eq('client_id', clientId)
        .gte('snapshot_date', from)
        .lte('snapshot_date', to),
      adminClient
        .from('contacts')
        .select('*')
        .eq('client_id', clientId)
        .gte('created_at', `${from}T00:00:00`)
        .lte('created_at', `${to}T23:59:59.999Z`)
        .order('created_at', { ascending: false }),
      adminClient
        .from('pipeline_events')
        .select('*, contacts!inner(client_id)')
        .eq('contacts.client_id', clientId)
        .gte('changed_at', `${from}T00:00:00`)
        .lte('changed_at', `${to}T23:59:59.999Z`),
      adminClient
        .from('client_kpis')
        .select('*')
        .eq('client_id', clientId)
        .single(),
      adminClient
        .from('client_health')
        .select('*')
        .eq('client_id', clientId)
        .single(),
      adminClient
        .from('clients')
        .select('name')
        .eq('id', clientId)
        .single(),
    ])

  const snapshots = snapshotsRes.data ?? []
  const contacts = contactsRes.data ?? []
  const kpis = kpisRes.data
  const health = healthRes.data
  const clientName = clientRes.data?.name || 'Client'

  // ── 3. Calculate summary metrics ───────────────────────────────────

  const totalSpend = snapshots.reduce((s, r) => s + (Number(r.spend) || 0), 0)
  const totalImpressions = snapshots.reduce(
    (s, r) => s + (Number(r.impressions) || 0),
    0,
  )
  const totalClicks = snapshots.reduce(
    (s, r) => s + (Number(r.clicks) || 0),
    0,
  )
  const totalLeads = snapshots.reduce(
    (s, r) => s + (Number(r.leads) || 0),
    0,
  )
  const blendedCTR =
    totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
  const blendedCPL = totalLeads > 0 ? totalSpend / totalLeads : 0

  const roasValues = snapshots
    .map((r) => Number(r.roas) || 0)
    .filter((v) => v > 0)
  const blendedROAS =
    roasValues.length > 0
      ? roasValues.reduce((a, b) => a + b, 0) / roasValues.length
      : 0

  // Pipeline stage breakdown (from contacts)
  const stageCounts: Record<string, number> = {}
  for (const c of contacts) {
    const stage = c.pipeline_stage || 'unknown'
    stageCounts[stage] = (stageCounts[stage] || 0) + 1
  }

  // Top 5 ads by ROAS (aggregated per ad)
  const adAgg: Record<
    string,
    { name: string; spend: number; leads: number; roas_sum: number; count: number }
  > = {}
  for (const s of snapshots) {
    const key = s.ad_id || s.ad_name || 'unknown'
    if (!adAgg[key]) {
      adAgg[key] = {
        name: s.ad_name || key,
        spend: 0,
        leads: 0,
        roas_sum: 0,
        count: 0,
      }
    }
    adAgg[key].spend += Number(s.spend) || 0
    adAgg[key].leads += Number(s.leads) || 0
    adAgg[key].roas_sum += Number(s.roas) || 0
    adAgg[key].count += 1
  }

  const topAds = Object.values(adAgg)
    .map((a) => ({
      name: a.name,
      spend: a.spend,
      leads: a.leads,
      cpl: a.leads > 0 ? a.spend / a.leads : 0,
      roas: a.count > 0 ? a.roas_sum / a.count : 0,
    }))
    .sort((a, b) => b.roas - a.roas)
    .slice(0, 5)

  // ── 4. Build HTML ──────────────────────────────────────────────────

  // --- Metric card helper ---
  function metricCard(value: string, label: string): string {
    return `
    <div style="border:1px solid #E5E7EB;border-radius:8px;padding:22px 16px;text-align:center;border-left:4px solid ${GOLD};">
      <div style="font-size:26px;font-weight:700;color:${NAVY};">${value}</div>
      <div style="font-size:11px;color:#6B7280;margin-top:6px;text-transform:uppercase;letter-spacing:0.8px;">${label}</div>
    </div>`
  }

  // --- Section header helper ---
  function sectionHeader(title: string): string {
    return `<div style="background:${NAVY};color:#fff;padding:14px 24px;margin-bottom:28px;border-radius:4px;">
      <h2 style="margin:0;font-size:19px;font-weight:600;letter-spacing:0.3px;">${title}</h2>
    </div>`
  }

  // --- KPI row helper ---
  function kpiRow(
    metric: string,
    current: string,
    targetVal: number | null,
    targetFmt: string,
    isBreach: boolean | null,
  ): string {
    const target = targetVal != null ? targetFmt : 'Not set'
    let statusHtml: string
    if (targetVal == null) {
      statusHtml = '<span style="color:#9CA3AF;">N/A</span>'
    } else if (isBreach) {
      statusHtml =
        '<span style="background:#FEE2E2;color:#DC2626;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;">Needs Attention</span>'
    } else {
      statusHtml =
        '<span style="background:#DCFCE7;color:#16A34A;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;">On Track</span>'
    }
    return `<tr>
      <td style="padding:12px 16px;border-bottom:1px solid #E5E7EB;font-weight:500;">${metric}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #E5E7EB;text-align:right;">${current}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #E5E7EB;text-align:right;">${target}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #E5E7EB;text-align:center;">${statusHtml}</td>
    </tr>`
  }

  // --- Pipeline bars ---
  const maxStageCount = Math.max(...Object.values(stageCounts), 1)
  const pipelineBarsHtml =
    Object.keys(stageCounts).length === 0
      ? '<p style="color:#9CA3AF;font-style:italic;text-align:center;padding:32px 0;">No pipeline data available for this period.</p>'
      : Object.entries(stageCounts)
          .sort((a, b) => b[1] - a[1])
          .map(
            ([stage, count]) => `
          <div style="display:flex;align-items:center;margin-bottom:14px;">
            <div style="width:120px;font-size:13px;font-weight:500;color:#374151;">${labelFor(stage)}</div>
            <div style="flex:1;background:#F3F4F6;border-radius:4px;height:30px;overflow:hidden;">
              <div style="background:linear-gradient(90deg,${NAVY},${colorFor(stage)});width:${Math.max((count / maxStageCount) * 100, 4)}%;height:100%;border-radius:4px;display:flex;align-items:center;justify-content:flex-end;padding-right:10px;">
                <span style="color:#fff;font-size:12px;font-weight:700;">${count}</span>
              </div>
            </div>
          </div>`,
          )
          .join('')

  // --- Health banner ---
  let healthBanner = ''
  if (health) {
    const statusConfig: Record<string, { bg: string; border: string; label: string }> = {
      healthy: { bg: '#DCFCE7', border: '#16A34A', label: 'Healthy' },
      warning: { bg: '#FEF9C3', border: '#CA8A04', label: 'Warning' },
      critical: { bg: '#FEE2E2', border: '#DC2626', label: 'Critical' },
    }
    const sc = statusConfig[health.status] || statusConfig.healthy
    const flags = (health.flags as string[]) ?? []
    healthBanner = `
    <div style="background:${sc.bg};border-left:4px solid ${sc.border};padding:14px 20px;border-radius:4px;margin-bottom:24px;">
      <span style="font-weight:700;color:${sc.border};font-size:14px;">Overall Health: ${sc.label}</span>
      ${
        flags.length > 0
          ? `<ul style="margin:8px 0 0;padding-left:20px;font-size:12px;color:#555;">${flags.map((f) => `<li style="margin-bottom:3px;">${escapeHtml(f)}</li>`).join('')}</ul>`
          : ''
      }
    </div>`
  }

  // --- Top ads table ---
  const topAdsHtml =
    topAds.length === 0
      ? '<p style="color:#9CA3AF;font-style:italic;text-align:center;padding:32px 0;">No ad data available for this period.</p>'
      : `<table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:${NAVY};color:#fff;">
          <th style="padding:12px 16px;text-align:left;font-weight:600;">Ad Name</th>
          <th style="padding:12px 16px;text-align:right;font-weight:600;">Spend</th>
          <th style="padding:12px 16px;text-align:right;font-weight:600;">Leads</th>
          <th style="padding:12px 16px;text-align:right;font-weight:600;">CPL</th>
          <th style="padding:12px 16px;text-align:right;font-weight:600;">ROAS</th>
        </tr>
      </thead>
      <tbody>
        ${topAds
          .map(
            (a, i) => `
        <tr style="background:${i % 2 === 0 ? '#fff' : '#F9FAFB'};">
          <td style="padding:12px 16px;border-bottom:1px solid #E5E7EB;font-weight:500;">${escapeHtml(a.name)}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #E5E7EB;text-align:right;">${fmtGBP(a.spend)}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #E5E7EB;text-align:right;">${a.leads}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #E5E7EB;text-align:right;">${fmtGBP(a.cpl)}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #E5E7EB;text-align:right;font-weight:600;color:${a.roas >= 1 ? '#16A34A' : '#DC2626'};">${a.roas.toFixed(2)}x</td>
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>`

  // --- Lead details table ---
  const leadTableHtml =
    contacts.length === 0
      ? '<p style="color:#9CA3AF;font-style:italic;text-align:center;padding:32px 0;">No leads generated in this period.</p>'
      : `<table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="background:${NAVY};color:#fff;">
          <th style="padding:10px 10px;text-align:left;font-weight:600;">Name</th>
          <th style="padding:10px 10px;text-align:left;font-weight:600;">Phone</th>
          <th style="padding:10px 10px;text-align:left;font-weight:600;">Email</th>
          <th style="padding:10px 10px;text-align:left;font-weight:600;">Source Ad</th>
          <th style="padding:10px 10px;text-align:left;font-weight:600;">Campaign</th>
          <th style="padding:10px 10px;text-align:left;font-weight:600;">Stage</th>
          <th style="padding:10px 10px;text-align:center;font-weight:600;">Quality</th>
          <th style="padding:10px 10px;text-align:left;font-weight:600;">Date</th>
        </tr>
      </thead>
      <tbody>
        ${contacts
          .map(
            (c, i) => `
        <tr style="background:${i % 2 === 0 ? '#fff' : '#F9FAFB'};">
          <td style="padding:9px 10px;border-bottom:1px solid #E5E7EB;font-weight:500;">${escapeHtml(((c.first_name || '') + ' ' + (c.last_name || '')).trim() || '—')}</td>
          <td style="padding:9px 10px;border-bottom:1px solid #E5E7EB;">${escapeHtml(c.phone || '—')}</td>
          <td style="padding:9px 10px;border-bottom:1px solid #E5E7EB;">${escapeHtml(c.email || '—')}</td>
          <td style="padding:9px 10px;border-bottom:1px solid #E5E7EB;">${escapeHtml(c.source_ad_name || '—')}</td>
          <td style="padding:9px 10px;border-bottom:1px solid #E5E7EB;">${escapeHtml(c.source_campaign_name || '—')}</td>
          <td style="padding:9px 10px;border-bottom:1px solid #E5E7EB;">
            <span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:10px;font-weight:600;color:#fff;background:${colorFor(c.pipeline_stage)};">${labelFor(c.pipeline_stage || 'unknown')}</span>
          </td>
          <td style="padding:9px 10px;border-bottom:1px solid #E5E7EB;text-align:center;">
            ${c.lead_quality === 'good' ? '<span style="color:#16A34A;font-weight:600;">Good</span>' : c.lead_quality === 'bad' ? '<span style="color:#DC2626;font-weight:600;">Bad</span>' : '<span style="color:#9CA3AF;">—</span>'}
          </td>
          <td style="padding:9px 10px;border-bottom:1px solid #E5E7EB;font-size:11px;color:#6B7280;">${c.created_at ? fmtDateShort(c.created_at) : '—'}</td>
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>`

  // ── Assemble full HTML ─────────────────────────────────────────────

  const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #1F2937; }
  @page { margin: 0; }
</style>
</head>
<body>

<!-- Cover Page -->
<div style="page-break-after:always;height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;background:${NAVY};text-align:center;">
  <div style="width:72px;height:72px;border:2px solid ${GOLD};border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:28px;">
    <span style="color:${GOLD};font-size:28px;">&#9733;</span>
  </div>
  <h1 style="color:#fff;font-size:40px;font-weight:300;letter-spacing:2px;margin-bottom:6px;">North Star Ventures</h1>
  <div style="width:60px;height:2px;background:${GOLD};margin:14px auto 20px;"></div>
  <p style="color:${GOLD};font-size:19px;letter-spacing:1px;margin-bottom:36px;">Performance Report</p>
  <p style="color:#fff;font-size:20px;font-weight:500;margin-bottom:8px;">${escapeHtml(clientName)}</p>
  <p style="color:${GOLD};font-size:14px;letter-spacing:0.5px;">${fmtDate(from)} &mdash; ${fmtDate(to)}</p>
</div>

<!-- Ad Performance Summary -->
<div style="page-break-after:always;padding:40px;">
  ${sectionHeader('Ad Performance Summary')}
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:32px;">
    ${metricCard(fmtGBP(totalSpend), 'Total Spend')}
    ${metricCard(fmtGBP(blendedCPL), 'Cost Per Lead')}
    ${metricCard(`${blendedROAS.toFixed(2)}x`, 'ROAS')}
    ${metricCard(fmtPct(blendedCTR), 'Click-Through Rate')}
    ${metricCard(totalLeads.toLocaleString(), 'Total Leads')}
    ${metricCard(totalClicks.toLocaleString(), 'Total Clicks')}
  </div>
  ${totalSpend === 0 ? '<p style="color:#9CA3AF;font-style:italic;text-align:center;padding:16px 0;">No ad spend data recorded for this period.</p>' : ''}
</div>

<!-- Top Performing Ads -->
<div style="page-break-after:always;padding:40px;">
  ${sectionHeader('Top 5 Performing Ads')}
  ${topAdsHtml}
</div>

<!-- Pipeline Breakdown -->
<div style="page-break-after:always;padding:40px;">
  ${sectionHeader('Pipeline Breakdown')}
  <p style="font-size:14px;color:#6B7280;margin-bottom:20px;">${contacts.length} lead${contacts.length !== 1 ? 's' : ''} generated in this period</p>
  <div style="max-width:560px;">
    ${pipelineBarsHtml}
  </div>
</div>

<!-- KPI Status -->
<div style="page-break-after:always;padding:40px;">
  ${sectionHeader('KPI Status vs Targets')}
  ${healthBanner}
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="background:${NAVY};color:#fff;">
        <th style="padding:12px 16px;text-align:left;font-weight:600;">Metric</th>
        <th style="padding:12px 16px;text-align:right;font-weight:600;">Current</th>
        <th style="padding:12px 16px;text-align:right;font-weight:600;">Target</th>
        <th style="padding:12px 16px;text-align:center;font-weight:600;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${kpiRow('Cost Per Lead', fmtGBP(blendedCPL), kpis?.max_cpl ?? null, `Max ${fmtGBP(Number(kpis?.max_cpl))}`, kpis?.max_cpl != null ? blendedCPL > Number(kpis.max_cpl) : null)}
      ${kpiRow('ROAS', `${blendedROAS.toFixed(2)}x`, kpis?.min_roas ?? null, `Min ${Number(kpis?.min_roas).toFixed(2)}x`, kpis?.min_roas != null ? blendedROAS < Number(kpis.min_roas) : null)}
      ${kpiRow('CTR', fmtPct(blendedCTR), kpis?.min_ctr ?? null, `Min ${Number(kpis?.min_ctr).toFixed(2)}%`, kpis?.min_ctr != null ? blendedCTR < Number(kpis.min_ctr) : null)}
      ${kpiRow('Daily Leads', totalLeads.toString(), kpis?.min_leads_per_day ?? null, `Min ${kpis?.min_leads_per_day}/day`, kpis?.min_leads_per_day != null ? totalLeads < Number(kpis.min_leads_per_day) : null)}
      ${kpiRow('Monthly Budget', fmtGBP(totalSpend), kpis?.monthly_budget ?? null, fmtGBP(Number(kpis?.monthly_budget)), kpis?.monthly_budget != null ? totalSpend > Number(kpis.monthly_budget) : null)}
    </tbody>
  </table>
</div>

<!-- Lead Details -->
<div style="padding:40px;">
  ${sectionHeader('Lead Details')}
  ${leadTableHtml}
  <div style="margin-top:48px;text-align:center;font-size:10px;color:#9CA3AF;border-top:1px solid #E5E7EB;padding-top:16px;">
    Generated on ${fmtDate(new Date().toISOString())} &bull; North Star Ventures &bull; Confidential
  </div>
</div>

</body>
</html>`

  // ── 5. Generate PDF with Puppeteer ─────────────────────────────────

  let browser
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
    const page = await browser.newPage()
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' })
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })
    await browser.close()

    // 6. Return PDF
    return new Response(Buffer.from(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="report_${from}_${to}.pdf"`,
      },
    })
  } catch (err: unknown) {
    if (browser) {
      await browser.close().catch(() => {})
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[reports/pdf] Puppeteer error:', message)
    return NextResponse.json(
      { error: 'Failed to generate PDF', details: message },
      { status: 500 },
    )
  }
}
