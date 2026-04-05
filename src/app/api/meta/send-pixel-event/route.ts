import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export async function POST(request: NextRequest) {
  try {
    const { client_id, action, contact } = await request.json()

    if (!client_id || !action) {
      return NextResponse.json(
        { error: 'Missing client_id or action' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    // 1. Fetch pixel config for this client -----------------------------------
    const { data: config, error: configError } = await admin
      .from('client_pixel_config')
      .select('*')
      .eq('client_id', client_id)
      .single()

    if (configError || !config) {
      return NextResponse.json({ sent: false, reason: 'no_config' })
    }

    // 2. Check if action is enabled in stage_event_map -------------------------
    const stageEventMap: Record<string, { enabled: boolean; event_name?: string }> =
      config.stage_event_map ?? {}

    const mapping = stageEventMap[action]

    if (!mapping?.enabled || !mapping?.event_name) {
      return NextResponse.json({ sent: false, reason: 'not_enabled' })
    }

    // 3. Build user_data hashes ------------------------------------------------
    const userData: Record<string, string[]> = {}

    if (contact?.email) {
      userData.em = [sha256(contact.email.toLowerCase().trim())]
    }
    if (contact?.phone) {
      userData.ph = [sha256(contact.phone.replace(/\D/g, ''))]
    }

    // 4. Fire Conversions API event --------------------------------------------
    const payload = {
      data: [
        {
          event_name: mapping.event_name,
          event_time: Math.floor(Date.now() / 1000),
          action_source: 'system_generated',
          user_data: userData,
          custom_data: {
            source_ad: contact?.source_ad_name ?? null,
            source_campaign: contact?.source_campaign_name ?? null,
            lead_quality: contact?.lead_quality ?? null,
            pipeline_stage: contact?.pipeline_stage ?? null,
          },
        },
      ],
      access_token: config.capi_access_token,
    }

    const pixelId = config.pixel_id
    const fbRes = await fetch(
      `https://graph.facebook.com/v19.0/${pixelId}/events`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )

    const fbData = await fbRes.json()

    console.log(
      `[send-pixel-event] client=${client_id} action=${action} event=${mapping.event_name} status=${fbRes.status}`,
      fbData
    )

    return NextResponse.json({ sent: true, fb_response: fbData })
  } catch (err) {
    console.error('[send-pixel-event] error', err)
    return NextResponse.json({ sent: false, reason: 'internal_error' })
  }
}
