import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

// ---------------------------------------------------------------------------
// GET  - Facebook webhook verification handshake
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (
    mode === 'subscribe' &&
    token === process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN
  ) {
    return new Response(challenge ?? '', { status: 200 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ---------------------------------------------------------------------------
// POST - Receive Facebook lead webhooks
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  // 1. Verify request signature ------------------------------------------------
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256')

  if (!signature || !process.env.FACEBOOK_APP_SECRET) {
    return NextResponse.json({ error: 'Missing signature or app secret' }, { status: 403 })
  }

  const expected =
    'sha256=' +
    crypto
      .createHmac('sha256', process.env.FACEBOOK_APP_SECRET)
      .update(rawBody)
      .digest('hex')

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  // 2. Parse body ---------------------------------------------------------------
  const body = JSON.parse(rawBody) as FacebookWebhookPayload

  // 3. Return 200 immediately, process in background ----------------------------
  //    (Next.js edge/node will keep the promise alive for the current invocation)
  const processingPromise = processEntries(body)

  // Fire-and-forget: we catch so an unhandled rejection never surfaces
  processingPromise.catch((err) =>
    console.error('[facebook-lead] background processing error', err)
  )

  return NextResponse.json({ ok: true }, { status: 200 })
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface FacebookWebhookPayload {
  object: string
  entry: {
    id: string
    time: number
    changes: {
      field: string
      value: {
        ad_id: string
        adset_id: string
        campaign_id: string
        form_id: string
        leadgen_id: string
        page_id: string
      }
    }[]
  }[]
}

interface LeadFieldData {
  name: string
  values: string[]
}

// ---------------------------------------------------------------------------
// Background processing
// ---------------------------------------------------------------------------
async function processEntries(body: FacebookWebhookPayload) {
  const admin = createAdminClient()

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'leadgen') continue

      const {
        ad_id,
        adset_id,
        campaign_id,
        leadgen_id,
        page_id,
      } = change.value

      try {
        // a) Match client by meta_ad_account_id (try page_id first) -----------
        let { data: client } = await admin
          .from('clients')
          .select('id, meta_access_token, meta_ad_account_id')
          .eq('meta_ad_account_id', page_id)
          .single()

        if (!client) {
          // Fallback: look for any client whose ad account matches
          const adAccountRes = await admin
            .from('clients')
            .select('id, meta_access_token, meta_ad_account_id')
            .not('meta_access_token', 'is', null)
            .limit(1)
            .single()

          client = adAccountRes.data
        }

        if (!client?.meta_access_token) {
          console.error(
            `[facebook-lead] No client found for page_id=${page_id}`
          )
          continue
        }

        const token = client.meta_access_token

        // b) Fetch lead data from Meta Graph API --------------------------------
        const leadRes = await fetch(
          `https://graph.facebook.com/v19.0/${leadgen_id}?access_token=${token}`
        )
        const leadData = await leadRes.json()

        if (!leadRes.ok) {
          console.error('[facebook-lead] Graph API lead fetch error', leadData)
          continue
        }

        // c) Parse field_data -----------------------------------------------------
        const fields: LeadFieldData[] = leadData.field_data ?? []
        const fieldMap = new Map(fields.map((f) => [f.name, f.values?.[0] ?? '']))

        const fullName = fieldMap.get('full_name') ?? ''
        const nameParts = fullName.trim().split(/\s+/)
        const firstName = nameParts[0] ?? ''
        const lastName = nameParts.slice(1).join(' ') || null

        const phone = fieldMap.get('phone_number') ?? fieldMap.get('phone') ?? null
        const email = fieldMap.get('email') ?? null

        // d) Resolve ad / adset / campaign names --------------------------------
        const [adName, adsetName, campaignName] = await Promise.all([
          resolveGraphName(ad_id, token),
          resolveGraphName(adset_id, token),
          resolveGraphName(campaign_id, token),
        ])

        // e) Insert contact -------------------------------------------------------
        const { data: contact, error: contactError } = await admin
          .from('contacts')
          .insert({
            client_id: client.id,
            first_name: firstName,
            last_name: lastName,
            phone,
            email,
            source_ad_id: ad_id,
            source_ad_name: adName,
            source_ad_set_id: adset_id,
            source_ad_set_name: adsetName,
            source_campaign_id: campaign_id,
            source_campaign_name: campaignName,
            pipeline_stage: 'new_lead',
            fb_lead_id: leadgen_id,
          })
          .select('id')
          .single()

        if (contactError) {
          console.error('[facebook-lead] insert contact error', contactError)
          continue
        }

        // f) Insert pipeline event ------------------------------------------------
        await admin.from('pipeline_events').insert({
          contact_id: contact!.id,
          from_stage: null,
          to_stage: 'new_lead',
          changed_at: new Date().toISOString(),
        })

        console.log(
          `[facebook-lead] Processed lead ${leadgen_id} -> contact ${contact!.id}`
        )
      } catch (err) {
        console.error(
          `[facebook-lead] Error processing leadgen_id=${leadgen_id}`,
          err
        )
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function resolveGraphName(
  objectId: string,
  accessToken: string
): Promise<string | null> {
  if (!objectId) return null
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${objectId}?fields=name&access_token=${accessToken}`
    )
    const data = await res.json()
    return data.name ?? null
  } catch {
    return null
  }
}
