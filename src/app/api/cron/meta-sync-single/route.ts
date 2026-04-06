import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { syncSingleClient } from '@/lib/meta-sync';

/* ------------------------------------------------------------------ */
/*  POST /api/cron/meta-sync-single                                   */
/*  Sync a single client.                                              */
/*  Auth: CRON_SECRET bearer token OR authenticated admin session.     */
/*  Body: { client_id: string }                                       */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  // Allow either CRON_SECRET or admin session auth
  const authHeader = request.headers.get('authorization');
  const isCronAuth = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isCronAuth) {
    // Try session-based admin auth
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const adminClient = createAdminClient();
    const { data: profile } = await adminClient.from('profiles').select('is_admin').eq('id', user.id).single();
    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const body = await request.json();
  const { client_id } = body;

  if (!client_id) {
    return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch client's Meta credentials
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, meta_ad_account_id, meta_access_token')
    .eq('id', client_id)
    .single();

  if (clientError || !client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  if (!client.meta_ad_account_id || !client.meta_access_token) {
    return NextResponse.json({ error: 'Client has no Meta credentials configured' }, { status: 400 });
  }

  const result = await syncSingleClient(
    supabase,
    client.id,
    client.meta_ad_account_id,
    client.meta_access_token,
  );

  return NextResponse.json({
    synced_at: new Date().toISOString(),
    ...result,
  });
}
