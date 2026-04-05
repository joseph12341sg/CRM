import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const status = request.nextUrl.searchParams.get('status')

  let query = supabase
    .from('ads')
    .select('*')
    .order('created_at', { ascending: false })

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name, ad_copy, image_url, prompt_used, campaign_id, ad_set_id, ad_id, status } = body

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const { data: ad, error: adError } = await supabase
    .from('ads')
    .insert({
      client_id: user.id,
      name,
      ad_copy: ad_copy || null,
      image_url: image_url || null,
      campaign_id: campaign_id || null,
      ad_set_id: ad_set_id || null,
      ad_id: ad_id || null,
      status: status || 'draft',
      version_number: 1,
    })
    .select('*')
    .single()

  if (adError) {
    return NextResponse.json({ error: adError.message }, { status: 500 })
  }

  // Insert first version
  await supabase.from('ad_versions').insert({
    ad_id: ad.id,
    client_id: user.id,
    ad_copy: ad_copy || null,
    prompt_used: prompt_used || null,
    version_number: 1,
  })

  return NextResponse.json(ad, { status: 201 })
}
