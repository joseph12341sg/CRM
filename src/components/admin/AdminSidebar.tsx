'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const [clients, setClients] = useState<{ id: string; name: string; health_status: string }[]>([]);

  // Check if we're in a per-client view
  const clientMatch = pathname.match(/\/admin\/clients\/([^/]+)/);
  const isClientView = !!clientMatch;

  useEffect(() => {
    if (!isClientView) return;
    async function fetchClients() {
      try {
        const res = await fetch('/api/admin/clients-list');
        const json = await res.json();
        if (json.clients) setClients(json.clients);
      } catch { /* ignore */ }
    }
    fetchClients();
  }, [isClientView]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const isActive = (path: string) => {
    if (path === '/admin') return pathname === '/admin';
    return pathname.startsWith(path);
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-dark-nav border-r border-dark-border flex flex-col z-50">
      {/* Branding */}
      <div className="px-6 py-8">
        <div className="flex items-center gap-3">
          <svg
            className="w-8 h-8 text-gold flex-shrink-0"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          <div>
            <h1 className="text-text-primary font-heading font-bold text-lg leading-tight">
              North Star Ventures
            </h1>
            <p className="text-text-muted text-xs tracking-widest uppercase mt-0.5">
              CRM
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4">
        <Link
          href="/admin"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            isActive('/admin')
              ? 'bg-dark-elevated text-gold border-l-2 border-gold'
              : 'text-text-secondary hover:bg-dark-elevated hover:text-text-primary'
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
            />
          </svg>
          Command Centre
        </Link>

        <div className="my-4 border-t border-dark-border" />
      </nav>

      {/* Client Switcher (shown when inside a client view) */}
      {isClientView && clients.length > 0 && (
        <div className="px-4 pb-4">
          <div className="border-t border-dark-border pt-4 mb-2">
            <p className="px-3 text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Switch Client</p>
          </div>
          <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
            {clients.map((c) => {
              const healthDot = c.health_status === 'critical' ? 'bg-danger' : c.health_status === 'warning' ? 'bg-warning' : 'bg-success';
              const isCurrentClient = clientMatch?.[1] === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => router.push(`/admin/clients/${c.id}`)}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                    isCurrentClient
                      ? 'bg-gold/10 text-gold font-medium'
                      : 'text-text-secondary hover:bg-dark-elevated hover:text-text-primary'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${healthDot}`} />
                  <span className="truncate">{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Logout */}
      <div className="px-4 pb-6">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:bg-dark-elevated hover:text-text-primary transition-all duration-200"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          Logout
        </button>
      </div>
    </aside>
  );
}
