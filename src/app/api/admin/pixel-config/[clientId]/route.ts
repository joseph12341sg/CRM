import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function verifyAdmin() {
  const supabase = createServerSupabaseClient()
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

// ---------------------------------------------------------------------------
// GET  - Fetch pixel config for a client
// ---------------------------------------------------------------------------
export async function GET(
  _request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const admin = await verifyAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const supabaseAdmin = createAdminClient()
    const { data, error } = await supabaseAdmin
      .from('client_pixel_config')
      .select('*')
      .eq('client_id', params.clientId)
      .single()

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ config: data ?? null })
  } catch (err) {
    console.error('[pixel-config GET] error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST - Upsert pixel config for a client
// ---------------------------------------------------------------------------
export async function POST(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const admin = await verifyAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { pixel_id, capi_access_token, stage_event_map } = body

    if (!pixel_id || !capi_access_token) {
      return NextResponse.json(
        { error: 'Missing required fields: pixel_id, capi_access_token' },
        { status: 400 }
      )
    }

    const supabaseAdmin = createAdminClient()
    const { data, error } = await supabaseAdmin
      .from('client_pixel_config')
      .upsert(
        {
          client_id: params.clientId,
          pixel_id,
          capi_access_token,
          stage_event_map: stage_event_map ?? {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'client_id' }
      )
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ config: data })
  } catch (err) {
    console.error('[pixel-config POST] error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
