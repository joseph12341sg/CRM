import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncSingleClient, type SyncResult } from '@/lib/meta-sync';

/* ------------------------------------------------------------------ */
/*  POST /api/cron/meta-sync                                          */
/*  Daily Meta Ads sync — protected by CRON_SECRET bearer token       */
/*  Loops through all clients and calls the shared sync function.     */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: clients, error: clientsError } = await supabase
    .from('clients')
    .select('id, meta_ad_account_id, meta_access_token')
    .not('meta_ad_account_id', 'is', null)
    .not('meta_access_token', 'is', null);

  if (clientsError) {
    return NextResponse.json({ error: 'Failed to fetch clients', detail: clientsError.message }, { status: 500 });
  }

  const summary: SyncResult[] = [];

  for (const client of (clients as { id: string; meta_ad_account_id: string; meta_access_token: string }[]) ?? []) {
    const result = await syncSingleClient(
      supabase,
      client.id,
      client.meta_ad_account_id,
      client.meta_access_token,
    );
    summary.push(result);
  }

  return NextResponse.json({
    synced_at: new Date().toISOString(),
    clients_processed: summary.length,
    summary,
  });
}
