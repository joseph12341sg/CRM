'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import StatCard from '@/components/ui/StatCard';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Snapshot {
  id: string;
  client_id: string;
  snapshot_date: string;
  campaign_id: string;
  campaign_name: string;
  ad_set_id: string;
  ad_set_name: string;
  ad_id: string;
  ad_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpl: number;
  roas: number;
  leads: number;
  created_at?: string;
}

type SortDirection = 'asc' | 'desc';

/* ------------------------------------------------------------------ */
/*  Formatting helpers                                                 */
/* ------------------------------------------------------------------ */

function fmtCurrency(n: number): string {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(2)}%`;
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-GB');
}

/* ------------------------------------------------------------------ */
/*  SortableTable                                                      */
/* ------------------------------------------------------------------ */

interface Column<T> {
  key: string;
  label: string;
  accessor: (row: T) => string | number;
  sortValue?: (row: T) => number | string;
  className?: string;
}

function SortableTable<T extends Record<string, unknown>>({
  columns,
  data,
  sortColumn,
  sortDirection,
  onSort,
}: {
  columns: Column<T>[];
  data: T[];
  sortColumn: string;
  sortDirection: SortDirection;
  onSort: (col: string) => void;
}) {
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortColumn);
    if (!col) return data;
    const valFn = col.sortValue ?? col.accessor;
    return [...data].sort((a, b) => {
      const va = valFn(a);
      const vb = valFn(b);
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDirection === 'asc' ? va - vb : vb - va;
      }
      return sortDirection === 'asc'
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
  }, [data, sortColumn, sortDirection, columns]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-dark-border bg-dark-elevated">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 text-left font-semibold text-text-secondary cursor-pointer select-none hover:text-gold transition-all duration-200 ${col.className ?? ''}`}
                onClick={() => onSort(col.key)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {sortColumn === col.key && (
                    <span className="text-gold text-xs">
                      {sortDirection === 'asc' ? '▲' : '▼'}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-text-muted"
              >
                No data available
              </td>
            </tr>
          ) : (
            sorted.map((row, i) => (
              <tr
                key={i}
                className={`${i % 2 === 0 ? 'bg-dark-card' : 'bg-dark-stripe'} hover:bg-dark-elevated transition-all duration-200 border-b border-dark-border`}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`px-4 py-3 text-text-primary ${col.className ?? ''}`}>
                    {col.accessor(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Aggregation helpers                                                */
/* ------------------------------------------------------------------ */

interface AggRow {
  [key: string]: unknown;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpl: number;
  roas: number;
  leads: number;
}

function aggregate(snapshots: Snapshot[], groupKey: 'campaign_id' | 'ad_set_id') {
  const map = new Map<string, AggRow>();
  for (const s of snapshots) {
    const gid = s[groupKey];
    const existing = map.get(gid);
    if (existing) {
      existing.spend += s.spend;
      existing.impressions += s.impressions;
      existing.clicks += s.clicks;
      existing.leads += s.leads;
    } else {
      map.set(gid, {
        ...(s as unknown as Record<string, unknown>),
        spend: s.spend,
        impressions: s.impressions,
        clicks: s.clicks,
        leads: s.leads,
        ctr: 0,
        cpl: 0,
        roas: 0,
      });
    }
  }
  // Recalculate blended metrics
  for (const row of Array.from(map.values())) {
    row.ctr = row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
    row.cpl = row.leads > 0 ? row.spend / row.leads : 0;
    // ROAS: weighted average by spend
    const matchingSnapshots = snapshots.filter((s) => s[groupKey] === (row as Record<string, unknown>)[groupKey]);
    const totalSpend = matchingSnapshots.reduce((acc, s) => acc + s.spend, 0);
    row.roas = totalSpend > 0
      ? matchingSnapshots.reduce((acc, s) => acc + s.roas * s.spend, 0) / totalSpend
      : 0;
  }
  return Array.from(map.values());
}

/* ------------------------------------------------------------------ */
/*  Download Report Modal                                              */
/* ------------------------------------------------------------------ */

function DownloadModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    if (!from || !to) return;
    setLoading(true);
    try {
      const res = await fetch('/api/reports/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      });
      if (!res.ok) throw new Error('Failed to generate report');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meta-report-${from}-to-${to}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch {
      alert('Failed to download report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-dark-card border border-dark-border rounded-xl shadow-gold-md p-6 w-full max-w-md">
        <h3 className="text-lg font-bold font-heading text-text-primary mb-4">Download Report</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              From
            </label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full border border-dark-border bg-dark-elevated rounded-lg px-3 py-2 text-sm text-text-primary focus:ring-2 focus:ring-gold focus:border-gold outline-none transition-all duration-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              To
            </label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full border border-dark-border bg-dark-elevated rounded-lg px-3 py-2 text-sm text-text-primary focus:ring-2 focus:ring-gold focus:border-gold outline-none transition-all duration-200"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-all duration-200"
          >
            Cancel
          </button>
          <button
            onClick={handleDownload}
            disabled={!from || !to || loading}
            className="px-4 py-2 text-sm font-bold text-dark bg-gold rounded-lg hover:bg-gold-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {loading ? 'Generating...' : 'Download PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function MetaDashboardPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState('');
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [showDownload, setShowDownload] = useState(false);

  // Sort state per table section
  const [campaignSort, setCampaignSort] = useState<{ col: string; dir: SortDirection }>({ col: 'spend', dir: 'desc' });
  const [adSetSort, setAdSetSort] = useState<{ col: string; dir: SortDirection }>({ col: 'spend', dir: 'desc' });
  const [adSort, setAdSort] = useState<{ col: string; dir: SortDirection }>({ col: 'spend', dir: 'desc' });

  const supabase = useMemo(() => createClient(), []);

  const fetchSnapshots = useCallback(
    async (date?: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (date) params.set('date', date);
        const res = await fetch(`/api/meta/snapshots?${params.toString()}`);
        const json = await res.json();
        setSnapshots(json.data ?? []);
        if (json.data?.length > 0) {
          const snapshotDate = json.data[0].snapshot_date;
          if (!date) setSelectedDate(snapshotDate);
          // Use the most recent created_at as "last synced"
          const latest = json.data.reduce(
            (best: string, row: Snapshot) =>
              row.created_at && row.created_at > best ? row.created_at : best,
            json.data[0].created_at ?? '',
          );
          setLastSynced(latest || null);
        } else {
          setLastSynced(null);
        }
      } catch {
        setSnapshots([]);
      } finally {
        setLoading(false);
      }
    },
    [supabase],
  );

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = e.target.value;
    setSelectedDate(date);
    if (date) fetchSnapshots(date);
  };

  // Toggle sort helper
  const toggleSort = (
    current: { col: string; dir: SortDirection },
    setter: (v: { col: string; dir: SortDirection }) => void,
  ) => {
    return (col: string) => {
      setter({
        col,
        dir: current.col === col && current.dir === 'desc' ? 'asc' : 'desc',
      });
    };
  };

  /* ---- Summaries ---- */
  const totalSpend = snapshots.reduce((s, r) => s + (r.spend || 0), 0);
  const totalImpressions = snapshots.reduce((s, r) => s + (r.impressions || 0), 0);
  const totalClicks = snapshots.reduce((s, r) => s + (r.clicks || 0), 0);
  const totalLeads = snapshots.reduce((s, r) => s + (r.leads || 0), 0);
  const blendedCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const blendedCPL = totalLeads > 0 ? totalSpend / totalLeads : 0;

  /* ---- Aggregated data ---- */
  const campaignRows = useMemo(() => aggregate(snapshots, 'campaign_id'), [snapshots]);
  const adSetRows = useMemo(() => aggregate(snapshots, 'ad_set_id'), [snapshots]);

  /* ---- Column definitions ---- */
  const campaignColumns: Column<AggRow>[] = [
    { key: 'campaign_name', label: 'Campaign Name', accessor: (r) => String(r.campaign_name ?? ''), className: 'font-medium' },
    { key: 'spend', label: 'Spend', accessor: (r) => fmtCurrency(r.spend), sortValue: (r) => r.spend },
    { key: 'impressions', label: 'Impressions', accessor: (r) => fmtNum(r.impressions), sortValue: (r) => r.impressions },
    { key: 'clicks', label: 'Clicks', accessor: (r) => fmtNum(r.clicks), sortValue: (r) => r.clicks },
    { key: 'ctr', label: 'CTR', accessor: (r) => fmtPct(r.ctr), sortValue: (r) => r.ctr },
    { key: 'cpl', label: 'CPL', accessor: (r) => fmtCurrency(r.cpl), sortValue: (r) => r.cpl },
    { key: 'roas', label: 'ROAS', accessor: (r) => r.roas.toFixed(2), sortValue: (r) => r.roas },
    { key: 'leads', label: 'Leads', accessor: (r) => fmtNum(r.leads), sortValue: (r) => r.leads },
  ];

  const adSetColumns: Column<AggRow>[] = [
    { key: 'ad_set_name', label: 'Ad Set Name', accessor: (r) => String(r.ad_set_name ?? ''), className: 'font-medium' },
    { key: 'campaign_name', label: 'Campaign', accessor: (r) => String(r.campaign_name ?? '') },
    { key: 'spend', label: 'Spend', accessor: (r) => fmtCurrency(r.spend), sortValue: (r) => r.spend },
    { key: 'impressions', label: 'Impressions', accessor: (r) => fmtNum(r.impressions), sortValue: (r) => r.impressions },
    { key: 'clicks', label: 'Clicks', accessor: (r) => fmtNum(r.clicks), sortValue: (r) => r.clicks },
    { key: 'ctr', label: 'CTR', accessor: (r) => fmtPct(r.ctr), sortValue: (r) => r.ctr },
    { key: 'cpl', label: 'CPL', accessor: (r) => fmtCurrency(r.cpl), sortValue: (r) => r.cpl },
    { key: 'roas', label: 'ROAS', accessor: (r) => r.roas.toFixed(2), sortValue: (r) => r.roas },
    { key: 'leads', label: 'Leads', accessor: (r) => fmtNum(r.leads), sortValue: (r) => r.leads },
  ];

  const adColumns: Column<Snapshot>[] = [
    { key: 'ad_name', label: 'Ad Name', accessor: (r) => r.ad_name, className: 'font-medium' },
    { key: 'ad_set_name', label: 'Ad Set', accessor: (r) => r.ad_set_name },
    { key: 'spend', label: 'Spend', accessor: (r) => fmtCurrency(r.spend), sortValue: (r) => r.spend },
    { key: 'impressions', label: 'Impressions', accessor: (r) => fmtNum(r.impressions), sortValue: (r) => r.impressions },
    { key: 'clicks', label: 'Clicks', accessor: (r) => fmtNum(r.clicks), sortValue: (r) => r.clicks },
    { key: 'ctr', label: 'CTR', accessor: (r) => fmtPct(r.ctr), sortValue: (r) => r.ctr },
    { key: 'cpl', label: 'CPL', accessor: (r) => fmtCurrency(r.cpl), sortValue: (r) => r.cpl },
    { key: 'roas', label: 'ROAS', accessor: (r) => r.roas.toFixed(2), sortValue: (r) => r.roas },
    { key: 'leads', label: 'Leads', accessor: (r) => fmtNum(r.leads), sortValue: (r) => r.leads },
  ];

  /* ---- Loading state ---- */
  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-dark-border border-t-gold" />
          <p className="mt-4 text-sm text-text-muted">Loading Meta data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      {/* ---- A) Header row ---- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-text-primary">Meta Dashboard</h1>
          {lastSynced && (
            <p className="mt-1 text-xs text-text-muted">
              Last synced:{' '}
              {new Date(lastSynced).toLocaleString('en-GB', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={handleDateChange}
            className="border border-dark-border bg-dark-elevated rounded-lg px-3 py-2 text-sm text-text-primary focus:ring-2 focus:ring-gold focus:border-gold outline-none transition-all duration-200"
          />
          <button
            onClick={() => setShowDownload(true)}
            className="px-4 py-2 text-sm font-bold text-dark bg-gold rounded-lg hover:bg-gold-hover transition-all duration-200"
          >
            Download Report
          </button>
        </div>
      </div>

      {/* ---- No data ---- */}
      {snapshots.length === 0 ? (
        <div className="bg-dark-card border border-dark-border rounded-xl shadow-gold-sm p-12 text-center">
          <p className="text-text-secondary text-lg">No data available</p>
          <p className="text-text-muted text-sm mt-2">
            Select a different date or wait for the next sync.
          </p>
        </div>
      ) : (
        <>
          {/* ---- B) Summary row ---- */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard label="Total Spend" value={fmtCurrency(totalSpend)} accent />
            <StatCard label="Total Impressions" value={fmtNum(totalImpressions)} />
            <StatCard label="Total Clicks" value={fmtNum(totalClicks)} />
            <StatCard label="Blended CTR" value={fmtPct(blendedCTR)} accent />
            <StatCard label="Blended CPL" value={fmtCurrency(blendedCPL)} accent />
            <StatCard label="Total Leads" value={fmtNum(totalLeads)} accent />
          </div>

          {/* ---- C) Campaign breakdown ---- */}
          <section className="bg-dark-card border border-dark-border rounded-xl shadow-gold-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-dark-border">
              <h2 className="text-base font-semibold font-heading text-gold">
                Campaign Breakdown
              </h2>
            </div>
            <SortableTable
              columns={campaignColumns}
              data={campaignRows}
              sortColumn={campaignSort.col}
              sortDirection={campaignSort.dir}
              onSort={toggleSort(campaignSort, setCampaignSort)}
            />
          </section>

          {/* ---- D) Ad Set breakdown ---- */}
          <section className="bg-dark-card border border-dark-border rounded-xl shadow-gold-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-dark-border">
              <h2 className="text-base font-semibold font-heading text-gold">
                Ad Set Breakdown
              </h2>
            </div>
            <SortableTable
              columns={adSetColumns}
              data={adSetRows}
              sortColumn={adSetSort.col}
              sortDirection={adSetSort.dir}
              onSort={toggleSort(adSetSort, setAdSetSort)}
            />
          </section>

          {/* ---- E) Ad-level breakdown ---- */}
          <section className="bg-dark-card border border-dark-border rounded-xl shadow-gold-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-dark-border">
              <h2 className="text-base font-semibold font-heading text-gold">
                Ad Breakdown
              </h2>
            </div>
            <SortableTable
              columns={adColumns}
              data={snapshots as unknown as (Snapshot & Record<string, unknown>)[]}
              sortColumn={adSort.col}
              sortDirection={adSort.dir}
              onSort={toggleSort(adSort, setAdSort)}
            />
          </section>
        </>
      )}

      {/* ---- F) Download modal ---- */}
      <DownloadModal open={showDownload} onClose={() => setShowDownload(false)} />
    </div>
  );
}
