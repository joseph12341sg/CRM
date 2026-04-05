import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/* ------------------------------------------------------------------ */
/*  POST /api/cron/meta-sync                                          */
/*  Daily Meta Ads sync — protected by CRON_SECRET bearer token       */
/* ------------------------------------------------------------------ */

interface MetaAction {
  action_type: string;
  value: string;
}

interface MetaInsightRow {
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  ad_id: string;
  ad_name: string;
  spend: string;
  impressions: string;
  clicks: string;
  ctr: string;
  cost_per_action_type?: MetaAction[];
  actions?: MetaAction[];
}

interface ClientRow {
  id: string;
  meta_ad_account_id: string;
  meta_access_token: string;
}

interface ClientKPIs {
  max_cpl: number | null;
  min_roas: number | null;
  min_leads_per_day: number | null;
  min_ctr: number | null;
  monthly_budget: number | null;
}

/* ------------------------------------------------------------------ */
/*  Health calculator                                                  */
/* ------------------------------------------------------------------ */

async function calculateClientHealth(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
) {
  const today = new Date().toISOString().slice(0, 10);

  // Fetch today's snapshots
  const { data: snapshots } = await supabase
    .from('meta_snapshots')
    .select('spend, impressions, clicks, ctr, cpl, roas, leads')
    .eq('client_id', clientId)
    .eq('snapshot_date', today);

  if (!snapshots || snapshots.length === 0) return;

  const totalSpend = snapshots.reduce((s, r) => s + (Number(r.spend) || 0), 0);
  const totalLeads = snapshots.reduce((s, r) => s + (Number(r.leads) || 0), 0);
  const totalImpressions = snapshots.reduce((s, r) => s + (Number(r.impressions) || 0), 0);
  const totalClicks = snapshots.reduce((s, r) => s + (Number(r.clicks) || 0), 0);
  const blendedCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const blendedCPL = totalLeads > 0 ? totalSpend / totalLeads : 0;

  // Fetch KPIs
  const { data: kpiRow } = await supabase
    .from('client_kpis')
    .select('max_cpl, min_roas, min_leads_per_day, min_ctr, monthly_budget')
    .eq('client_id', clientId)
    .single();

  const kpis: ClientKPIs = kpiRow ?? {
    max_cpl: null,
    min_roas: null,
    min_leads_per_day: null,
    min_ctr: null,
    monthly_budget: null,
  };

  // Average ROAS across ads
  const roasValues = snapshots.map((r) => Number(r.roas) || 0);
  const avgRoas = roasValues.length > 0
    ? roasValues.reduce((a, b) => a + b, 0) / roasValues.length
    : 0;

  // Breach detection
  const flags: string[] = [];

  if (kpis.max_cpl !== null && blendedCPL > kpis.max_cpl) {
    flags.push(`CPL £${blendedCPL.toFixed(2)} exceeds target of £${kpis.max_cpl.toFixed(2)}`);
  }
  if (kpis.min_roas !== null && avgRoas < kpis.min_roas) {
    flags.push(`ROAS ${avgRoas.toFixed(2)} is below target of ${kpis.min_roas.toFixed(2)}`);
  }
  if (kpis.min_leads_per_day !== null && totalLeads < kpis.min_leads_per_day) {
    flags.push(`Leads ${totalLeads} below daily target of ${kpis.min_leads_per_day}`);
  }
  if (kpis.min_ctr !== null && blendedCTR < kpis.min_ctr) {
    flags.push(`CTR ${blendedCTR.toFixed(2)}% is below target of ${kpis.min_ctr.toFixed(2)}%`);
  }

  // Monthly spend pace
  if (kpis.monthly_budget !== null) {
    const monthStart = today.slice(0, 7) + '-01';
    const { data: monthSnapshots } = await supabase
      .from('meta_snapshots')
      .select('spend')
      .eq('client_id', clientId)
      .gte('snapshot_date', monthStart)
      .lte('snapshot_date', today);

    if (monthSnapshots) {
      const monthSpend = monthSnapshots.reduce((s, r) => s + (Number(r.spend) || 0), 0);
      const dayOfMonth = new Date(today).getDate();
      const daysInMonth = new Date(
        new Date(today).getFullYear(),
        new Date(today).getMonth() + 1,
        0,
      ).getDate();
      const expectedPace = (kpis.monthly_budget / daysInMonth) * dayOfMonth;

      if (monthSpend > expectedPace * 1.15) {
        flags.push(
          `Monthly spend £${monthSpend.toFixed(2)} is over-pacing (expected £${expectedPace.toFixed(2)} by day ${dayOfMonth})`,
        );
      } else if (monthSpend < expectedPace * 0.7) {
        flags.push(
          `Monthly spend £${monthSpend.toFixed(2)} is under-pacing (expected £${expectedPace.toFixed(2)} by day ${dayOfMonth})`,
        );
      }
    }
  }

  // Determine status
  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (flags.length >= 2) status = 'critical';
  else if (flags.length === 1) status = 'warning';

  // Upsert health
  await supabase.from('client_health').upsert(
    {
      client_id: clientId,
      status,
      flags,
      calculated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id' },
  );

  return { status, flags };
}

/* ------------------------------------------------------------------ */
/*  POST handler                                                      */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  // Fetch clients with Meta credentials
  const { data: clients, error: clientsError } = await supabase
    .from('clients')
    .select('id, meta_ad_account_id, meta_access_token')
    .not('meta_ad_account_id', 'is', null)
    .not('meta_access_token', 'is', null);

  if (clientsError) {
    return NextResponse.json({ error: 'Failed to fetch clients', detail: clientsError.message }, { status: 500 });
  }

  const summary: {
    client_id: string;
    ads_synced: number;
    health: { status: string; flags: string[] } | null;
    error?: string;
  }[] = [];

  for (const client of (clients as ClientRow[]) ?? []) {
    try {
      // Call Meta Ads API
      const url = new URL(
        `https://graph.facebook.com/v19.0/act_${client.meta_ad_account_id}/insights`,
      );
      url.searchParams.set('level', 'ad');
      url.searchParams.set(
        'fields',
        'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,ctr,cost_per_action_type,actions',
      );
      url.searchParams.set('date_preset', 'today');
      url.searchParams.set('access_token', client.meta_access_token);

      const metaRes = await fetch(url.toString());
      const metaJson = await metaRes.json();

      if (!metaRes.ok) {
        summary.push({
          client_id: client.id,
          ads_synced: 0,
          health: null,
          error: metaJson?.error?.message ?? 'Meta API error',
        });
        continue;
      }

      const rows: MetaInsightRow[] = metaJson.data ?? [];

      // Build insert rows
      const insertRows = rows.map((row) => {
        const cplAction = row.cost_per_action_type?.find(
          (a) => a.action_type === 'lead',
        );
        const leadsAction = row.actions?.find((a) => a.action_type === 'lead');
        const purchaseAction = row.actions?.find(
          (a) => a.action_type === 'offsite_conversion.fb_pixel_purchase',
        );

        const spend = parseFloat(row.spend) || 0;
        let roas = 0;
        if (purchaseAction && spend > 0) {
          roas = parseFloat(purchaseAction.value) / spend;
        }

        return {
          client_id: client.id,
          snapshot_date: today,
          campaign_id: row.campaign_id,
          campaign_name: row.campaign_name,
          ad_set_id: row.adset_id,
          ad_set_name: row.adset_name,
          ad_id: row.ad_id,
          ad_name: row.ad_name,
          spend,
          impressions: parseInt(row.impressions) || 0,
          clicks: parseInt(row.clicks) || 0,
          ctr: parseFloat(row.ctr) || 0,
          cpl: parseFloat(cplAction?.value ?? '0') || 0,
          roas,
          leads: parseInt(leadsAction?.value ?? '0') || 0,
        };
      });

      if (insertRows.length > 0) {
        const { error: insertError } = await supabase
          .from('meta_snapshots')
          .insert(insertRows);

        if (insertError) {
          summary.push({
            client_id: client.id,
            ads_synced: 0,
            health: null,
            error: `Insert failed: ${insertError.message}`,
          });
          continue;
        }
      }

      // Calculate health
      const health = await calculateClientHealth(supabase, client.id);

      summary.push({
        client_id: client.id,
        ads_synced: insertRows.length,
        health: health ?? null,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      summary.push({
        client_id: client.id,
        ads_synced: 0,
        health: null,
        error: message,
      });
    }
  }

  return NextResponse.json({
    synced_at: new Date().toISOString(),
    clients_processed: summary.length,
    summary,
  });
}
