import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adId = params.id
  const body = await request.json()

  // Fetch current ad to get version number
  const { data: existing, error: fetchError } = await supabase
    .from('ads')
    .select('version_number')
    .eq('id', adId)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Ad not found' }, { status: 404 })
  }

  const newVersionNumber = (existing.version_number || 0) + 1

  // Update the ad
  const updatePayload: Record<string, unknown> = {
    version_number: newVersionNumber,
  }

  const allowedFields = [
    'name',
    'ad_copy',
    'image_url',
    'campaign_id',
    'ad_set_id',
    'ad_id',
    'status',
  ]

  for (const field of allowedFields) {
    if (field in body) {
      updatePayload[field] = body[field] || null
    }
  }

  const { data: updatedAd, error: updateError } = await supabase
    .from('ads')
    .update(updatePayload)
    .eq('id', adId)
    .select('*')
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Insert new version row
  await supabase.from('ad_versions').insert({
    ad_id: adId,
    client_id: user.id,
    ad_copy: body.ad_copy || updatedAd.ad_copy || null,
    prompt_used: body.prompt_used || null,
    version_number: newVersionNumber,
  })

  return NextResponse.json(updatedAd)
}
