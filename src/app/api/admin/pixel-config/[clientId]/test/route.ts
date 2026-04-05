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
// POST - Fire a test event to verify pixel config
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

    const body = await request.json().catch(() => ({}))
    const testEventCode: string | undefined = body.test_event_code

    const supabaseAdmin = createAdminClient()
    const { data: config, error: configError } = await supabaseAdmin
      .from('client_pixel_config')
      .select('*')
      .eq('client_id', params.clientId)
      .single()

    if (configError || !config) {
      return NextResponse.json(
        { error: 'No pixel config found for this client' },
        { status: 404 }
      )
    }

    // Build test payload -------------------------------------------------------
    const eventPayload: Record<string, unknown> = {
      data: [
        {
          event_name: 'PageView',
          event_time: Math.floor(Date.now() / 1000),
          action_source: 'system_generated',
          user_data: {
            em: ['test@example.com'], // unhashed for test readability
          },
        },
      ],
      access_token: config.capi_access_token,
    }

    if (testEventCode) {
      eventPayload.test_event_code = testEventCode
    }

    const fbRes = await fetch(
      `https://graph.facebook.com/v19.0/${config.pixel_id}/events`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventPayload),
      }
    )

    const fbData = await fbRes.json()

    return NextResponse.json({
      success: fbRes.ok,
      status: fbRes.status,
      fb_response: fbData,
    })
  } catch (err) {
    console.error('[pixel-config test] error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
