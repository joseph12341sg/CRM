import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    // 1. Get authenticated user
    const supabase = createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Verify caller is admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.is_admin) {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 })
    }

    // 3. Extract body
    const body = await request.json()
    const { name, email, password, meta_ad_account_id, meta_access_token, lead_sms_number, lead_sms_enabled } = body

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'Missing required fields: name, email, password' },
        { status: 400 }
      )
    }

    // 4. Create auth user via admin client (service role)
    const adminSupabase = createAdminClient()

    const { data: newUserData, error: createUserError } =
      await adminSupabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })

    if (createUserError || !newUserData.user) {
      return NextResponse.json(
        { error: createUserError?.message || 'Failed to create auth user' },
        { status: 500 }
      )
    }

    const newUserId = newUserData.user.id

    // 5. Insert into profiles
    const { error: profileInsertError } = await adminSupabase
      .from('profiles')
      .insert({ id: newUserId, email, is_admin: false })

    if (profileInsertError) {
      // Cleanup: remove the auth user if profile insert fails
      await adminSupabase.auth.admin.deleteUser(newUserId)
      return NextResponse.json(
        { error: `Failed to create profile: ${profileInsertError.message}` },
        { status: 500 }
      )
    }

    // 6. Insert into clients
    const clientRow: Record<string, unknown> = {
      id: newUserId,
      name,
      email,
    }
    if (meta_ad_account_id) clientRow.meta_ad_account_id = meta_ad_account_id
    if (meta_access_token) clientRow.meta_access_token = meta_access_token
    if (lead_sms_number) clientRow.lead_sms_number = lead_sms_number
    if (lead_sms_enabled) clientRow.lead_sms_enabled = lead_sms_enabled

    const { data: clientData, error: clientInsertError } = await adminSupabase
      .from('clients')
      .insert(clientRow)
      .select()
      .single()

    if (clientInsertError) {
      // Cleanup
      await adminSupabase.from('profiles').delete().eq('id', newUserId)
      await adminSupabase.auth.admin.deleteUser(newUserId)
      return NextResponse.json(
        { error: `Failed to create client: ${clientInsertError.message}` },
        { status: 500 }
      )
    }

    // 6b. Insert onboarding checklist
    await adminSupabase.from('client_checklist').insert({
      client_id: newUserId,
      business_manager_connected: false,
      connected_to_ad_manager: false,
      ad_created: false,
      ads_scheduled: false,
      api_set_up: !!meta_access_token,
      pixel_set_up: false,
      lead_notification_set_up: false,
    })

    // 7. Return created client + password
    return NextResponse.json({
      client: clientData,
      credentials: { email, password },
    })
  } catch (err) {
    console.error('create-client error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
