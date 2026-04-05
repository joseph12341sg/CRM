import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

async function verifyAdmin(supabase: ReturnType<typeof createServerSupabaseClient>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  return profile?.is_admin ? user : null
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const admin = await verifyAdmin(supabase)

    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const clientId = request.nextUrl.searchParams.get('client_id')
    if (!clientId) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('client_kpis')
      .select('*')
      .eq('client_id', clientId)
      .single()

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ kpis: data || null })
  } catch (err) {
    console.error('get-kpis error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const admin = await verifyAdmin(supabase)

    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { client_id, max_cpl, min_roas, min_leads_per_day, min_ctr, monthly_budget } = body

    if (!client_id) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('client_kpis')
      .upsert(
        {
          client_id,
          max_cpl: max_cpl ?? null,
          min_roas: min_roas ?? null,
          min_leads_per_day: min_leads_per_day ?? null,
          min_ctr: min_ctr ?? null,
          monthly_budget: monthly_budget ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'client_id' }
      )
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ kpis: data })
  } catch (err) {
    console.error('set-kpis error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
