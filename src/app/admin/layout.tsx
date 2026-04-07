import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';
import AdminSidebar from '@/components/admin/AdminSidebar';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  if (!isAdminEmail(user.email)) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-dark">
      <AdminSidebar />
      <main className="ml-64 min-h-screen">
        {children}
      </main>
    </div>
  );
}
