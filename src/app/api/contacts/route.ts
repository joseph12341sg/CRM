import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const stage = searchParams.get('stage')
    const quality = searchParams.get('quality')
    const campaign = searchParams.get('campaign')
    const ad = searchParams.get('ad')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    let query = supabase
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false })

    if (stage) {
      query = query.eq('pipeline_stage', stage)
    }
    if (quality === 'good' || quality === 'bad') {
      query = query.eq('lead_quality', quality)
    } else if (quality === 'unset') {
      query = query.is('lead_quality', null)
    }
    if (campaign) {
      query = query.eq('source_campaign_name', campaign)
    }
    if (ad) {
      query = query.eq('source_ad_name', ad)
    }
    if (from) {
      query = query.gte('created_at', from)
    }
    if (to) {
      query = query.lte('created_at', `${to}T23:59:59.999Z`)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ contacts: data })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
