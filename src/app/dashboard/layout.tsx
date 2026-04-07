import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';
import DashboardSidebar from '@/components/dashboard/DashboardSidebar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user && isAdminEmail(user.email)) {
    redirect('/admin');
  }

  return (
    <div className="min-h-screen bg-dark">
      <DashboardSidebar />
      <main className="md:ml-64 min-h-screen pt-16 md:pt-0">
        {children}
      </main>
    </div>
  );
}
