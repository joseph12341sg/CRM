import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({
      authenticated: false,
      error: userError?.message ?? 'no user',
    });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, is_admin, created_at')
    .eq('id', user.id)
    .single();

  const { data: clientRow, error: clientError } = await supabase
    .from('clients')
    .select('id, name, active')
    .eq('id', user.id)
    .single();

  return NextResponse.json({
    authenticated: true,
    auth_user: {
      id: user.id,
      email: user.email,
    },
    profile: profile ?? null,
    profile_error: profileError?.message ?? null,
    client_row: clientRow ?? null,
    client_error: clientError?.message ?? null,
  });
}
