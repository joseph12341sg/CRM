import { createAdminClient } from '@/lib/supabase/admin';

/* ------------------------------------------------------------------ */
/*  Shared Meta sync logic — used by both nightly cron and manual sync */
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

interface ClientKPIs {
  max_cpl: number | null;
  min_roas: number | null;
  min_leads_per_day: number | null;
  min_ctr: number | null;
  monthly_budget: number | null;
  min_cac: number | null;
}

export interface SyncResult {
  client_id: string;
  ads_synced: number;
  health: { status: string; flags: string[] } | null;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Health calculator                                                  */
/* ------------------------------------------------------------------ */

export async function calculateClientHealth(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
) {
  const today = new Date().toISOString().slice(0, 10);

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

  const { data: kpiRow } = await supabase
    .from('client_kpis')
    .select('max_cpl, min_roas, min_leads_per_day, min_ctr, monthly_budget, min_cac')
    .eq('client_id', clientId)
    .single();

  const kpis: ClientKPIs = kpiRow ?? {
    max_cpl: null,
    min_roas: null,
    min_leads_per_day: null,
    min_ctr: null,
    monthly_budget: null,
    min_cac: null,
  };

  const roasValues = snapshots.map((r) => Number(r.roas) || 0);
  const avgRoas = roasValues.length > 0
    ? roasValues.reduce((a, b) => a + b, 0) / roasValues.length
    : 0;

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

  // CAC check
  if (kpis.min_cac !== null) {
    const { count: wonCount } = await supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('pipeline_stage', 'won')
      .gte('updated_at', `${today}T00:00:00`)
      .lte('updated_at', `${today}T23:59:59.999Z`);

    const cac = (wonCount ?? 0) > 0 ? totalSpend / (wonCount ?? 0) : 0;
    if (cac > kpis.min_cac) {
      flags.push(`CAC £${cac.toFixed(2)} exceeds target of £${kpis.min_cac.toFixed(2)}`);
    }
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

  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (flags.length >= 2) status = 'critical';
  else if (flags.length === 1) status = 'warning';

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
/*  Sync a single client                                               */
/* ------------------------------------------------------------------ */

export async function syncSingleClient(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  metaAdAccountId: string,
  metaAccessToken: string,
): Promise<SyncResult> {
  const today = new Date().toISOString().slice(0, 10);

  try {
    const url = new URL(
      `https://graph.facebook.com/v19.0/act_${metaAdAccountId}/insights`,
    );
    url.searchParams.set('level', 'ad');
    url.searchParams.set(
      'fields',
      'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,ctr,cost_per_action_type,actions',
    );
    url.searchParams.set('date_preset', 'today');
    url.searchParams.set('access_token', metaAccessToken);

    const metaRes = await fetch(url.toString());
    const metaJson = await metaRes.json();

    if (!metaRes.ok) {
      return {
        client_id: clientId,
        ads_synced: 0,
        health: null,
        error: metaJson?.error?.message ?? 'Meta API error',
      };
    }

    const rows: MetaInsightRow[] = metaJson.data ?? [];

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
        client_id: clientId,
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
        return {
          client_id: clientId,
          ads_synced: 0,
          health: null,
          error: `Insert failed: ${insertError.message}`,
        };
      }
    }

    // Calculate ad fatigue
    const thisWeekStart = new Date();
    thisWeekStart.setDate(thisWeekStart.getDate() - 7);
    const lastWeekStart = new Date();
    lastWeekStart.setDate(lastWeekStart.getDate() - 14);

    const thisWeekStr = thisWeekStart.toISOString().slice(0, 10);
    const lastWeekStr = lastWeekStart.toISOString().slice(0, 10);

    const { data: thisWeekSnaps } = await supabase
      .from('meta_snapshots')
      .select('ad_id, cpl, ctr')
      .eq('client_id', clientId)
      .gte('snapshot_date', thisWeekStr)
      .lte('snapshot_date', today);

    const { data: lastWeekSnaps } = await supabase
      .from('meta_snapshots')
      .select('ad_id, cpl, ctr')
      .eq('client_id', clientId)
      .gte('snapshot_date', lastWeekStr)
      .lt('snapshot_date', thisWeekStr);

    const aggregateByAd = (snaps: typeof thisWeekSnaps) => {
      const map: Record<string, { cplSum: number; ctrSum: number; count: number }> = {};
      for (const s of (snaps ?? [])) {
        if (!s.ad_id) continue;
        if (!map[s.ad_id]) map[s.ad_id] = { cplSum: 0, ctrSum: 0, count: 0 };
        map[s.ad_id].cplSum += Number(s.cpl) || 0;
        map[s.ad_id].ctrSum += Number(s.ctr) || 0;
        map[s.ad_id].count += 1;
      }
      return map;
    };

    const thisWeekAgg = aggregateByAd(thisWeekSnaps);
    const lastWeekAgg = aggregateByAd(lastWeekSnaps);

    const adIds = Array.from(new Set([...Object.keys(thisWeekAgg), ...Object.keys(lastWeekAgg)]));
    for (const adId of adIds) {
      const tw = thisWeekAgg[adId];
      const lw = lastWeekAgg[adId];
      if (!tw || !lw || lw.count === 0 || tw.count === 0) continue;

      const twAvgCPL = tw.cplSum / tw.count;
      const lwAvgCPL = lw.cplSum / lw.count;
      const twAvgCTR = tw.ctrSum / tw.count;
      const lwAvgCTR = lw.ctrSum / lw.count;

      const cplChange = lwAvgCPL > 0 ? ((twAvgCPL - lwAvgCPL) / lwAvgCPL) * 100 : 0;
      const ctrChange = lwAvgCTR > 0 ? ((twAvgCTR - lwAvgCTR) / lwAvgCTR) * 100 : 0;
      const frequency = 0;

      await supabase
        .from('ads')
        .update({ ad_fatigue: { cplChange, ctrChange, frequency, updatedAt: new Date().toISOString() } })
        .eq('client_id', clientId)
        .eq('ad_id', adId);
    }

    const health = await calculateClientHealth(supabase, clientId);

    return {
      client_id: clientId,
      ads_synced: insertRows.length,
      health: health ?? null,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      client_id: clientId,
      ads_synced: 0,
      health: null,
      error: message,
    };
  }
}
