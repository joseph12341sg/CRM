import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/* ------------------------------------------------------------------ */
/*  GET /api/admin/clients-list                                        */
/*  Returns all clients with id, name, and health status.              */
/*  Cached for 30 seconds.                                             */
/* ------------------------------------------------------------------ */

export const revalidate = 30;

export async function GET() {
  const supabase = createServerSupabaseClient();

  // Verify admin
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminClient = createAdminClient();

  const { data: profile } = await adminClient
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch clients
  const { data: clients } = await adminClient
    .from('clients')
    .select('id, name')
    .order('name');

  // Fetch health status
  const { data: healthRows } = await adminClient
    .from('client_health')
    .select('client_id, status');

  const healthMap: Record<string, string> = {};
  (healthRows ?? []).forEach((h: { client_id: string; status: string }) => {
    healthMap[h.client_id] = h.status;
  });

  const result = (clients ?? []).map((c: { id: string; name: string }) => ({
    id: c.id,
    name: c.name,
    health_status: healthMap[c.id] ?? 'healthy',
  }));

  return NextResponse.json(
    { clients: result },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    },
  );
}
