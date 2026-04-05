import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = createServerSupabaseClient()

    // Verify authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 })
    }

    // Fetch client_health joined with clients for name
    const { data, error } = await supabase
      .from('client_health')
      .select('*, clients(name)')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Flatten the joined client name
    const results = (data || []).map((row: Record<string, unknown>) => {
      const clients = row.clients as { name: string } | null
      return {
        ...row,
        client_name: clients?.name ?? null,
        clients: undefined,
      }
    })

    return NextResponse.json({ health: results })
  } catch (err) {
    console.error('health error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
