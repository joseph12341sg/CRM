'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/* ---------- types ---------- */
interface Client {
  id: string;
  name: string;
}

interface ClientHealth {
  client_id: string;
  status: string;
  flags: { message: string }[];
  calculated_at: string;
}

interface MetaSnapshot {
  client_id: string;
  cpl: number | null;
  roas: number | null;
  leads: number | null;
  spend: number | null;
  snapshot_date: string;
}

interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  client_id: string;
  source_ad_name: string | null;
  pipeline_stage: string | null;
  created_at: string;
  clients?: { name: string } | null;
}


interface ClientTask {
  id: string;
  client_id: string;
  title: string;
  due_date: string | null;
  is_complete: boolean;
}

/* ---------- helpers ---------- */
function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatNumber(n: number | null | undefined): string {
  if (n == null) return '--';
  return n.toLocaleString('en-AU', { maximumFractionDigits: 2 });
}

function formatCurrency(n: number | null | undefined): string {
  if (n == null) return '--';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(n);
}

function healthColor(status: string) {
  switch (status?.toLowerCase()) {
    case 'critical':
      return 'bg-red-100 text-red-700';
    case 'warning':
      return 'bg-amber-100 text-amber-700';
    default:
      return 'bg-green-100 text-green-700';
  }
}

function healthSortOrder(status: string): number {
  switch (status?.toLowerCase()) {
    case 'critical':
      return 0;
    case 'warning':
      return 1;
    default:
      return 2;
  }
}

function stageBadgeColor(stage: string | null) {
  switch (stage?.toLowerCase()) {
    case 'new':
      return 'bg-blue-100 text-blue-700';
    case 'contacted':
      return 'bg-indigo-100 text-indigo-700';
    case 'qualified':
      return 'bg-purple-100 text-purple-700';
    case 'won':
      return 'bg-green-100 text-green-700';
    case 'lost':
      return 'bg-gray-100 text-gray-500';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

/* ---------- component ---------- */
export default function AdminCommandCentre() {
  const supabase = createClient();
  const router = useRouter();

  // loading
  const [loading, setLoading] = useState(true);

  // summary
  const [totalClients, setTotalClients] = useState(0);
  const [leadsThisMonth, setLeadsThisMonth] = useState(0);
  const [adSpendMonth, setAdSpendMonth] = useState(0);
  const [flaggedCount, setFlaggedCount] = useState(0);

  // client cards
  const [clients, setClients] = useState<Client[]>([]);
  const [healthMap, setHealthMap] = useState<Record<string, ClientHealth>>({});
  const [latestSnapshots, setLatestSnapshots] = useState<Record<string, MetaSnapshot>>({});
  const [pipelineCounts, setPipelineCounts] = useState<Record<string, Record<string, number>>>({});

  // alerts
  const [alerts, setAlerts] = useState<
    { clientName: string; message: string; calculatedAt: string }[]
  >([]);

  // leads feed
  const [recentContacts, setRecentContacts] = useState<Contact[]>([]);

  // notes & tasks
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [noteContent, setNoteContent] = useState('');
  const [noteSavedAt, setNoteSavedAt] = useState<string | null>(null);
  const [tasks, setTasks] = useState<ClientTask[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');

  /* ---------- data fetch ---------- */
  const fetchData = useCallback(async () => {
    setLoading(true);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // 1. clients
    const { data: clientRows } = await supabase
      .from('clients')
      .select('id, name')
      .eq('active', true);
    const safeClients: Client[] = clientRows ?? [];
    setClients(safeClients);
    setTotalClients(safeClients.length);

    // 2. leads this month
    const { count: leadsCount } = await supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthStart);
    setLeadsThisMonth(leadsCount ?? 0);

    // 3. ad spend this month
    const { data: spendRows } = await supabase
      .from('meta_snapshots')
      .select('spend')
      .gte('snapshot_date', monthStart.slice(0, 10));
    const totalSpend = (spendRows ?? []).reduce(
      (sum: number, r: { spend: number | null }) => sum + (r.spend ?? 0),
      0,
    );
    setAdSpendMonth(totalSpend);

    // 4. client health
    const { data: healthRows } = await supabase
      .from('client_health')
      .select('client_id, status, flags, calculated_at');
    const hMap: Record<string, ClientHealth> = {};
    let flagged = 0;
    const alertList: { clientName: string; message: string; calculatedAt: string }[] = [];

    (healthRows ?? []).forEach((h: ClientHealth) => {
      hMap[h.client_id] = h;
      if (h.status === 'warning' || h.status === 'critical') {
        flagged++;
        const cName = safeClients.find((c) => c.id === h.client_id)?.name ?? 'Unknown';
        const flags = Array.isArray(h.flags) ? h.flags : [];
        flags.forEach((f) => {
          alertList.push({
            clientName: cName,
            message: f.message ?? String(f),
            calculatedAt: h.calculated_at,
          });
        });
      }
    });
    setHealthMap(hMap);
    setFlaggedCount(flagged);
    setAlerts(alertList.sort((a, b) => new Date(b.calculatedAt).getTime() - new Date(a.calculatedAt).getTime()));

    // 5. latest meta snapshots per client
    const { data: snapRows } = await supabase
      .from('meta_snapshots')
      .select('client_id, cpl, roas, leads, spend, snapshot_date')
      .order('snapshot_date', { ascending: false });
    const snapMap: Record<string, MetaSnapshot> = {};
    (snapRows ?? []).forEach((s: MetaSnapshot) => {
      if (!snapMap[s.client_id]) snapMap[s.client_id] = s;
    });
    setLatestSnapshots(snapMap);

    // 6. pipeline counts per client
    const { data: contactRows } = await supabase
      .from('contacts')
      .select('client_id, pipeline_stage');
    const pMap: Record<string, Record<string, number>> = {};
    (contactRows ?? []).forEach((c: { client_id: string; pipeline_stage: string | null }) => {
      const stage = c.pipeline_stage ?? 'Unknown';
      if (!pMap[c.client_id]) pMap[c.client_id] = {};
      pMap[c.client_id][stage] = (pMap[c.client_id][stage] || 0) + 1;
    });
    setPipelineCounts(pMap);

    // 7. recent contacts (global leads feed)
    const { data: recentRows } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, client_id, source_ad_name, pipeline_stage, created_at, clients(name)')
      .order('created_at', { ascending: false })
      .limit(20);
    setRecentContacts((recentRows as unknown as Contact[]) ?? []);

    // default selected client
    if (safeClients.length > 0 && !selectedClientId) {
      setSelectedClientId(safeClients[0].id);
    }

    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ---------- notes & tasks for selected client ---------- */
  const fetchNotesAndTasks = useCallback(
    async (clientId: string) => {
      if (!clientId) return;

      const { data: noteRows } = await supabase
        .from('client_notes')
        .select('id, client_id, content, updated_at')
        .eq('client_id', clientId)
        .limit(1)
        .maybeSingle();

      setNoteContent(noteRows?.content ?? '');
      setNoteSavedAt(noteRows?.updated_at ?? null);

      const { data: taskRows } = await supabase
        .from('client_tasks')
        .select('id, client_id, title, due_date, is_complete')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      setTasks(taskRows ?? []);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (selectedClientId) fetchNotesAndTasks(selectedClientId);
  }, [selectedClientId, fetchNotesAndTasks]);

  /* ---------- note save ---------- */
  const saveNote = async () => {
    if (!selectedClientId) return;
    await supabase.from('client_notes').upsert(
      { client_id: selectedClientId, content: noteContent, updated_at: new Date().toISOString() },
      { onConflict: 'client_id' },
    );
    setNoteSavedAt(new Date().toISOString());
  };

  /* ---------- task actions ---------- */
  const addTask = async () => {
    if (!newTaskTitle.trim() || !selectedClientId) return;
    const { data } = await supabase
      .from('client_tasks')
      .insert({
        client_id: selectedClientId,
        title: newTaskTitle.trim(),
        due_date: newTaskDue || null,
        is_complete: false,
      })
      .select()
      .single();
    if (data) setTasks((prev) => [data, ...prev]);
    setNewTaskTitle('');
    setNewTaskDue('');
  };

  const toggleTask = async (task: ClientTask) => {
    await supabase
      .from('client_tasks')
      .update({ is_complete: !task.is_complete })
      .eq('id', task.id);
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, is_complete: !t.is_complete } : t)),
    );
  };

  const clearCompleted = async () => {
    const completedIds = tasks.filter((t) => t.is_complete).map((t) => t.id);
    if (completedIds.length === 0) return;
    await supabase.from('client_tasks').delete().in('id', completedIds);
    setTasks((prev) => prev.filter((t) => !t.is_complete));
  };

  /* ---------- sorted clients ---------- */
  const sortedClients = [...clients].sort((a, b) => {
    const aOrder = healthSortOrder(healthMap[a.id]?.status ?? 'healthy');
    const bOrder = healthSortOrder(healthMap[b.id]?.status ?? 'healthy');
    return aOrder - bOrder;
  });

  /* ---------- render ---------- */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-gold border-t-transparent rounded-full animate-spin" />
          <p className="text-navy-300 text-sm">Loading Command Centre...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-navy">Command Centre</h1>
        <p className="text-navy-300 text-sm mt-1">Overview of all client accounts</p>
      </div>

      {/* ========== A) Summary Bar ========== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Active Clients', value: formatNumber(totalClients) },
          { label: 'Leads This Month', value: formatNumber(leadsThisMonth) },
          { label: 'Ad Spend This Month', value: formatCurrency(adSpendMonth) },
          { label: 'Flagged Clients', value: formatNumber(flaggedCount) },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-xl p-6 shadow-sm border-l-4 border-gold"
          >
            <p className="text-3xl font-bold text-navy">{card.value}</p>
            <p className="text-sm text-navy-300 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* ========== B) Client Cards Row ========== */}
      <div>
        <h2 className="text-lg font-semibold text-navy mb-3">Clients</h2>
        <div className="flex gap-4 overflow-x-auto pb-3">
          {sortedClients.map((client) => {
            const health = healthMap[client.id];
            const snap = latestSnapshots[client.id];
            const pipeline = pipelineCounts[client.id] ?? {};
            const status = health?.status ?? 'healthy';

            return (
              <div
                key={client.id}
                className="bg-white rounded-xl p-5 shadow-sm min-w-[280px] max-w-[320px] flex flex-col gap-3 flex-shrink-0"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-navy truncate">{client.name}</h3>
                  <span
                    className={`text-xs font-medium px-2.5 py-0.5 rounded-full capitalize ${healthColor(status)}`}
                  >
                    {status}
                  </span>
                </div>

                {snap ? (
                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div>
                      <p className="font-semibold text-navy">{formatCurrency(snap.cpl)}</p>
                      <p className="text-navy-300 text-xs">CPL</p>
                    </div>
                    <div>
                      <p className="font-semibold text-navy">{formatNumber(snap.roas)}</p>
                      <p className="text-navy-300 text-xs">ROAS</p>
                    </div>
                    <div>
                      <p className="font-semibold text-navy">{formatNumber(snap.leads)}</p>
                      <p className="text-navy-300 text-xs">Leads</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-navy-300 italic">No data</p>
                )}

                {Object.keys(pipeline).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(pipeline).map(([stage, count]) => (
                      <span
                        key={stage}
                        className={`text-xs px-2 py-0.5 rounded-full ${stageBadgeColor(stage)}`}
                      >
                        {stage}: {count}
                      </span>
                    ))}
                  </div>
                )}

                {health?.calculated_at && (
                  <p className="text-xs text-navy-300">
                    Last sync: {relativeTime(health.calculated_at)}
                  </p>
                )}

                <button
                  onClick={() => router.push(`/admin/clients/${client.id}`)}
                  className="mt-auto text-sm font-medium text-gold hover:text-gold-600 transition-colors text-left"
                >
                  View client &rarr;
                </button>
              </div>
            );
          })}

          {/* + Create client card */}
          <button
            onClick={() => router.push('/admin/clients/create')}
            className="bg-white rounded-xl p-5 shadow-sm min-w-[200px] flex flex-col items-center justify-center gap-2 flex-shrink-0 border-2 border-dashed border-navy-100 hover:border-gold transition-colors"
          >
            <span className="text-3xl text-gold">+</span>
            <span className="text-sm font-medium text-navy-300">Create client</span>
          </button>
        </div>
      </div>

      {/* ========== C) Two-column: Alerts + Leads Feed ========== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* KPI Alerts Panel */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-navy mb-4">KPI Alerts</h2>
          {alerts.length === 0 ? (
            <div className="flex items-center gap-2 text-green-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium">All clients healthy</span>
            </div>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {alerts.map((alert, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-navy">{alert.clientName}</p>
                    <p className="text-sm text-navy-300">{alert.message}</p>
                    <p className="text-xs text-navy-200 mt-1">
                      {relativeTime(alert.calculatedAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Global Leads Feed */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-navy mb-4">Recent Leads</h2>
          {recentContacts.length === 0 ? (
            <p className="text-sm text-navy-300">No leads yet</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {recentContacts.map((contact) => {
                const clientName =
                  (contact.clients as { name: string } | null)?.name ?? 'Unknown';
                return (
                  <button
                    key={contact.id}
                    onClick={() =>
                      router.push(
                        `/admin/clients/${contact.client_id}?tab=pipeline`,
                      )
                    }
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-navy-50 flex items-center justify-center text-xs font-bold text-navy flex-shrink-0">
                      {(contact.first_name?.[0] ?? '').toUpperCase()}
                      {(contact.last_name?.[0] ?? '').toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-navy truncate">
                        {contact.first_name} {contact.last_name}
                      </p>
                      <p className="text-xs text-navy-300 truncate">
                        {clientName}
                        {contact.source_ad_name ? ` \u00B7 ${contact.source_ad_name}` : ''}
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${stageBadgeColor(contact.pipeline_stage)}`}
                    >
                      {contact.pipeline_stage ?? 'N/A'}
                    </span>
                    <span className="text-xs text-navy-200 flex-shrink-0">
                      {relativeTime(contact.created_at)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ========== D) Notes & Tasks ========== */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-navy">Notes &amp; Tasks</h2>
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="border border-navy-100 rounded-lg px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Notes */}
          <div>
            <h3 className="text-sm font-semibold text-navy mb-2">Notes</h3>
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              onBlur={saveNote}
              placeholder="Add notes for this client..."
              rows={6}
              className="w-full border border-navy-100 rounded-lg p-3 text-sm text-navy resize-none focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent"
            />
            {noteSavedAt && (
              <p className="text-xs text-navy-200 mt-1">
                Last saved: {new Date(noteSavedAt).toLocaleString()}
              </p>
            )}
          </div>

          {/* Tasks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-navy">Tasks</h3>
              {tasks.some((t) => t.is_complete) && (
                <button
                  onClick={clearCompleted}
                  className="text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  Clear completed
                </button>
              )}
            </div>

            {/* Add task */}
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTask()}
                placeholder="New task..."
                className="flex-1 border border-navy-100 rounded-lg px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent"
              />
              <input
                type="date"
                value={newTaskDue}
                onChange={(e) => setNewTaskDue(e.target.value)}
                className="border border-navy-100 rounded-lg px-2 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent"
              />
              <button
                onClick={addTask}
                className="bg-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gold-600 transition-colors"
              >
                Add
              </button>
            </div>

            {/* Task list */}
            <div className="space-y-2 max-h-[240px] overflow-y-auto">
              {tasks.length === 0 ? (
                <p className="text-sm text-navy-300">No tasks yet</p>
              ) : (
                tasks.map((task) => (
                  <label
                    key={task.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={task.is_complete}
                      onChange={() => toggleTask(task)}
                      className="w-4 h-4 accent-gold rounded"
                    />
                    <span
                      className={`text-sm flex-1 ${task.is_complete ? 'line-through text-navy-200' : 'text-navy'}`}
                    >
                      {task.title}
                    </span>
                    {task.due_date && (
                      <span className="text-xs text-navy-300">
                        {new Date(task.due_date).toLocaleDateString()}
                      </span>
                    )}
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
