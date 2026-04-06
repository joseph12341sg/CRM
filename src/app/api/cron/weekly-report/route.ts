import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Resend } from 'resend';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const resendKey = process.env.RESEND_API_KEY;
  if (!adminEmail || !resendKey) {
    return NextResponse.json({ error: 'Missing ADMIN_EMAIL or RESEND_API_KEY' }, { status: 500 });
  }

  const resend = new Resend(resendKey);
  const supabase = createAdminClient();

  const now = new Date();
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - 7);
  const lastWeekStart = new Date(now);
  lastWeekStart.setDate(now.getDate() - 14);

  const thisWeekStr = thisWeekStart.toISOString().slice(0, 10);
  const lastWeekStr = lastWeekStart.toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);

  // Fetch all clients
  const { data: clients } = await supabase.from('clients').select('id, name');
  const allClients = clients ?? [];

  // Fetch health data
  const { data: healthRows } = await supabase.from('client_health').select('client_id, status, flags');
  const healthMap: Record<string, { status: string; flags: string[] }> = {};
  (healthRows ?? []).forEach((h: any) => { healthMap[h.client_id] = { status: h.status, flags: Array.isArray(h.flags) ? h.flags.map((f: any) => typeof f === 'string' ? f : f.message ?? String(f)) : [] }; });

  // Fetch checklist data
  const { data: checklistRows } = await supabase.from('client_checklist').select('*');
  const checklistMap: Record<string, any> = {};
  (checklistRows ?? []).forEach((r: any) => { checklistMap[r.client_id] = r; });

  // Fetch snapshots this week & last week
  const { data: thisWeekSnaps } = await supabase.from('meta_snapshots').select('client_id, spend, leads, clicks, impressions, cpl, roas, ctr').gte('snapshot_date', thisWeekStr).lte('snapshot_date', todayStr);
  const { data: lastWeekSnaps } = await supabase.from('meta_snapshots').select('client_id, spend, leads, clicks, impressions, cpl, roas, ctr').gte('snapshot_date', lastWeekStr).lt('snapshot_date', thisWeekStr);

  // Fetch contacts this week & last week
  const { data: thisWeekContacts } = await supabase.from('contacts').select('client_id, pipeline_stage').gte('created_at', `${thisWeekStr}T00:00:00`);
  const { data: lastWeekContacts } = await supabase.from('contacts').select('client_id').gte('created_at', `${lastWeekStr}T00:00:00`).lt('created_at', `${thisWeekStr}T00:00:00`);

  // Fetch all contacts for pipeline snapshot
  const { data: allContacts } = await supabase.from('contacts').select('client_id, pipeline_stage');

  // Aggregate functions
  function sumByClient(data: any[], field: string) {
    const map: Record<string, number> = {};
    (data ?? []).forEach((r: any) => { map[r.client_id] = (map[r.client_id] || 0) + (Number(r[field]) || 0); });
    return map;
  }

  function countByClient(data: any[]) {
    const map: Record<string, number> = {};
    (data ?? []).forEach((r: any) => { map[r.client_id] = (map[r.client_id] || 0) + 1; });
    return map;
  }

  const twSpend = sumByClient(thisWeekSnaps ?? [], 'spend');
  const lwSpend = sumByClient(lastWeekSnaps ?? [], 'spend');
  const twLeads = countByClient(thisWeekContacts ?? []);
  const lwLeads = countByClient(lastWeekContacts ?? []);

  // Agency summary
  const totalLeadsTW = Object.values(twLeads).reduce((a, b) => a + b, 0);
  const totalLeadsLW = Object.values(lwLeads).reduce((a, b) => a + b, 0);
  const totalSpendTW = Object.values(twSpend).reduce((a, b) => a + b, 0);
  const totalSpendLW = Object.values(lwSpend).reduce((a, b) => a + b, 0);

  let healthyCount = 0, warningCount = 0, criticalCount = 0;
  let incompleteChecklist = 0;
  allClients.forEach(c => {
    const h = healthMap[c.id]?.status ?? 'healthy';
    if (h === 'healthy') healthyCount++;
    else if (h === 'warning') warningCount++;
    else criticalCount++;

    const cl = checklistMap[c.id];
    if (cl) {
      const items = [cl.business_manager_connected, cl.connected_to_ad_manager, cl.ad_created, cl.ads_scheduled, cl.api_set_up, cl.pixel_set_up, cl.lead_notification_set_up];
      if (items.some((v: boolean) => !v)) incompleteChecklist++;
    }
  });

  const NAVY = '#0F1B2D';
  const GOLD = '#C9A84C';

  function arrow(current: number, previous: number): string {
    if (current > previous) return '<span style="color:#16A34A;">&#9650;</span>';
    if (current < previous) return '<span style="color:#DC2626;">&#9660;</span>';
    return '<span style="color:#9CA3AF;">&#8212;</span>';
  }

  function fmtGBP(n: number): string {
    return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // Build pipeline snapshot per client
  function pipelineForClient(clientId: string): Record<string, number> {
    const map: Record<string, number> = {};
    (allContacts ?? []).filter((c: any) => c.client_id === clientId).forEach((c: any) => {
      const stage = c.pipeline_stage ?? 'unknown';
      map[stage] = (map[stage] || 0) + 1;
    });
    return map;
  }

  // Sort clients: critical first
  const sortedClients = [...allClients].sort((a, b) => {
    const order: Record<string, number> = { critical: 0, warning: 1, healthy: 2 };
    return (order[healthMap[a.id]?.status ?? 'healthy'] ?? 2) - (order[healthMap[b.id]?.status ?? 'healthy'] ?? 2);
  });

  // Build per-client HTML
  const clientSections = sortedClients.map(c => {
    const health = healthMap[c.id] ?? { status: 'healthy', flags: [] };
    const statusColors: Record<string, string> = { healthy: '#16A34A', warning: '#CA8A04', critical: '#DC2626' };
    const statusBg: Record<string, string> = { healthy: '#DCFCE7', warning: '#FEF9C3', critical: '#FEE2E2' };

    const twS = twSpend[c.id] ?? 0;
    const lwS = lwSpend[c.id] ?? 0;
    const twL = twLeads[c.id] ?? 0;
    const lwL = lwLeads[c.id] ?? 0;
    const twCPL = twL > 0 ? twS / twL : 0;
    const lwCPL = lwL > 0 ? lwS / lwL : 0;

    const pipeline = pipelineForClient(c.id);
    const pipelineHtml = Object.entries(pipeline).map(([stage, count]) =>
      `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;background:#F3F4F6;margin-right:4px;">${stage}: ${count}</span>`
    ).join('');

    const cl = checklistMap[c.id];
    let checklistHtml = '';
    if (cl) {
      const items = [cl.business_manager_connected, cl.connected_to_ad_manager, cl.ad_created, cl.ads_scheduled, cl.api_set_up, cl.pixel_set_up, cl.lead_notification_set_up];
      const done = items.filter(Boolean).length;
      checklistHtml = `<p style="font-size:12px;color:#6B7280;">Checklist: ${done}/7 complete</p>`;
    }

    return `
    <div style="border:1px solid #E5E7EB;border-radius:8px;padding:20px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <h3 style="font-size:16px;font-weight:600;color:${NAVY};margin:0;">${c.name}</h3>
        <span style="background:${statusBg[health.status]};color:${statusColors[health.status]};padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;text-transform:capitalize;">${health.status}</span>
      </div>
      <table style="width:100%;font-size:13px;border-collapse:collapse;">
        <tr style="border-bottom:1px solid #E5E7EB;">
          <td style="padding:6px 0;color:#6B7280;">Metric</td>
          <td style="padding:6px 8px;text-align:right;font-weight:600;">This Week</td>
          <td style="padding:6px 8px;text-align:right;font-weight:600;">Last Week</td>
          <td style="padding:6px 0;text-align:center;width:30px;"></td>
        </tr>
        <tr><td style="padding:4px 0;">Spend</td><td style="text-align:right;">${fmtGBP(twS)}</td><td style="text-align:right;">${fmtGBP(lwS)}</td><td style="text-align:center;">${arrow(twS, lwS)}</td></tr>
        <tr><td style="padding:4px 0;">CPL</td><td style="text-align:right;">${fmtGBP(twCPL)}</td><td style="text-align:right;">${fmtGBP(lwCPL)}</td><td style="text-align:center;">${arrow(lwCPL, twCPL)}</td></tr>
        <tr><td style="padding:4px 0;">Leads</td><td style="text-align:right;">${twL}</td><td style="text-align:right;">${lwL}</td><td style="text-align:center;">${arrow(twL, lwL)}</td></tr>
      </table>
      <div style="margin-top:10px;">${pipelineHtml}</div>
      ${health.flags.length > 0 ? `<div style="margin-top:8px;font-size:12px;color:#DC2626;">${health.flags.map(f => `<span>&#9888; ${f}</span>`).join('<br/>')}</div>` : ''}
      ${checklistHtml}
    </div>`;
  }).join('');

  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',system-ui,sans-serif;color:#1F2937;max-width:640px;margin:0 auto;padding:20px;">
  <div style="background:${NAVY};padding:24px;border-radius:8px 8px 0 0;text-align:center;">
    <h1 style="color:#fff;font-size:22px;margin:0;">North Star Ventures</h1>
    <div style="width:40px;height:2px;background:${GOLD};margin:10px auto;"></div>
    <p style="color:${GOLD};font-size:14px;margin:4px 0 0;">Weekly CRM Report — ${dateStr}</p>
  </div>

  <div style="border:1px solid #E5E7EB;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
    <h2 style="font-size:16px;color:${NAVY};border-bottom:2px solid ${GOLD};padding-bottom:6px;margin-top:0;">Agency Summary</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
      <div style="background:#F9FAFB;padding:12px;border-radius:6px;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:${NAVY};">${totalLeadsTW}</div>
        <div style="font-size:11px;color:#6B7280;">Leads this week ${arrow(totalLeadsTW, totalLeadsLW)} (${totalLeadsLW} last week)</div>
      </div>
      <div style="background:#F9FAFB;padding:12px;border-radius:6px;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:${NAVY};">${fmtGBP(totalSpendTW)}</div>
        <div style="font-size:11px;color:#6B7280;">Spend this week ${arrow(totalSpendLW, totalSpendTW)} (${fmtGBP(totalSpendLW)} last week)</div>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:20px;font-size:12px;">
      <span style="background:#DCFCE7;color:#16A34A;padding:4px 10px;border-radius:12px;">${healthyCount} Healthy</span>
      <span style="background:#FEF9C3;color:#CA8A04;padding:4px 10px;border-radius:12px;">${warningCount} Warning</span>
      <span style="background:#FEE2E2;color:#DC2626;padding:4px 10px;border-radius:12px;">${criticalCount} Critical</span>
    </div>
    ${incompleteChecklist > 0 ? `<p style="font-size:12px;color:#CA8A04;margin-bottom:16px;">&#9888; ${incompleteChecklist} client${incompleteChecklist > 1 ? 's' : ''} with incomplete setup checklist</p>` : ''}

    <h2 style="font-size:16px;color:${NAVY};border-bottom:2px solid ${GOLD};padding-bottom:6px;">Client Breakdown</h2>
    ${clientSections}

    <div style="margin-top:24px;text-align:center;font-size:10px;color:#9CA3AF;border-top:1px solid #E5E7EB;padding-top:12px;">
      Generated on ${dateStr} &bull; North Star Ventures CRM
    </div>
  </div>
</body>
</html>`;

  try {
    await resend.emails.send({
      from: 'North Star Ventures <onboarding@resend.dev>',
      to: adminEmail,
      subject: `North Star Ventures — Weekly CRM Report ${dateStr}`,
      html,
    });

    return NextResponse.json({ success: true, sent_to: adminEmail });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[weekly-report] Email send error:', message);
    return NextResponse.json({ error: 'Failed to send email', details: message }, { status: 500 });
  }
}
