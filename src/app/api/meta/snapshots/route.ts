import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/* ------------------------------------------------------------------ */
/*  GET /api/meta/snapshots                                           */
/*  Returns meta_snapshots for the authenticated client.              */
/*  Query params: date | from+to | (default: most recent date)       */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = request.nextUrl;

  const date = searchParams.get('date');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  let query = supabase
    .from('meta_snapshots')
    .select('*')
    .order('campaign_name', { ascending: true })
    .order('ad_set_name', { ascending: true })
    .order('ad_name', { ascending: true });

  if (date) {
    // Single date filter
    query = query.eq('snapshot_date', date);
  } else if (from && to) {
    // Date range filter
    query = query.gte('snapshot_date', from).lte('snapshot_date', to);
  } else {
    // Default: find the most recent snapshot_date, then fetch all rows for it
    const { data: latest } = await supabase
      .from('meta_snapshots')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

    if (!latest) {
      return NextResponse.json({ data: [], snapshot_date: null });
    }

    query = query.eq('snapshot_date', latest.snapshot_date);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: data ?? [],
    snapshot_date: date ?? from ?? data?.[0]?.snapshot_date ?? null,
  });
}
