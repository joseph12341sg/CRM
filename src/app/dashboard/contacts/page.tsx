'use client';

import { useEffect, useState, useMemo } from 'react';
import Badge from '@/components/ui/Badge';
import ContactDrawer, { type Contact } from '@/components/contacts/ContactDrawer';
import AddContactModal from '@/components/contacts/AddContactModal';
import { createClient } from '@/lib/supabase/client';
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGE_COLORS,
} from '@/lib/constants';

type SortKey =
  | 'name'
  | 'phone'
  | 'email'
  | 'source_ad_name'
  | 'source_campaign_name'
  | 'pipeline_stage'
  | 'lead_quality'
  | 'lead_score'
  | 'created_at';

type SortDir = 'asc' | 'desc';

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & filters
  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [filterQuality, setFilterQuality] = useState('');
  const [filterCampaign, setFilterCampaign] = useState('');
  const [filterAd, setFilterAd] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Drawer
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  // Bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState('');
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Add contact modal
  const [showAddContact, setShowAddContact] = useState(false);

  // Fetch contacts
  useEffect(() => {
    const fetchContacts = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (filterStage) params.set('stage', filterStage);
        if (filterQuality) params.set('quality', filterQuality);
        if (filterCampaign) params.set('campaign', filterCampaign);
        if (filterAd) params.set('ad', filterAd);
        if (dateFrom) params.set('from', dateFrom);
        if (dateTo) params.set('to', dateTo);

        const res = await fetch(`/api/contacts?${params.toString()}`);
        const json = await res.json();
        setContacts(json.contacts ?? []);
      } catch {
        setContacts([]);
      }
      setLoading(false);
    };
    fetchContacts();
  }, [filterStage, filterQuality, filterCampaign, filterAd, dateFrom, dateTo]);

  // Unique values for dropdowns
  const uniqueCampaigns = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach((c) => {
      if (c.source_campaign_name) set.add(c.source_campaign_name);
    });
    return Array.from(set).sort();
  }, [contacts]);

  const uniqueAds = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach((c) => {
      if (c.source_ad_name) set.add(c.source_ad_name);
    });
    return Array.from(set).sort();
  }, [contacts]);

  // Client-side search filter
  const searchFiltered = useMemo(() => {
    if (!search.trim()) return contacts;
    const q = search.toLowerCase();
    return contacts.filter((c) => {
      const fullName = `${c.first_name} ${c.last_name}`.toLowerCase();
      return (
        fullName.includes(q) ||
        (c.email?.toLowerCase().includes(q) ?? false) ||
        (c.phone?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [contacts, search]);

  // Sorted contacts
  const sorted = useMemo(() => {
    const arr = [...searchFiltered];
    arr.sort((a, b) => {
      let aVal: string;
      let bVal: string;

      switch (sortKey) {
        case 'name':
          aVal = `${a.first_name} ${a.last_name}`.toLowerCase();
          bVal = `${b.first_name} ${b.last_name}`.toLowerCase();
          break;
        case 'phone':
          aVal = (a.phone ?? '').toLowerCase();
          bVal = (b.phone ?? '').toLowerCase();
          break;
        case 'email':
          aVal = (a.email ?? '').toLowerCase();
          bVal = (b.email ?? '').toLowerCase();
          break;
        case 'source_ad_name':
          aVal = (a.source_ad_name ?? '').toLowerCase();
          bVal = (b.source_ad_name ?? '').toLowerCase();
          break;
        case 'source_campaign_name':
          aVal = (a.source_campaign_name ?? '').toLowerCase();
          bVal = (b.source_campaign_name ?? '').toLowerCase();
          break;
        case 'pipeline_stage':
          aVal = a.pipeline_stage;
          bVal = b.pipeline_stage;
          break;
        case 'lead_quality':
          aVal = a.lead_quality ?? '';
          bVal = b.lead_quality ?? '';
          break;
        case 'lead_score':
          aVal = String(a.lead_score ?? '');
          bVal = String(b.lead_score ?? '');
          break;
        case 'created_at':
          aVal = a.created_at;
          bVal = b.created_at;
          break;
        default:
          aVal = '';
          bVal = '';
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [searchFiltered, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (filterStage) params.set('stage', filterStage);
    if (filterQuality) params.set('quality', filterQuality);
    if (filterCampaign) params.set('campaign', filterCampaign);
    if (filterAd) params.set('ad', filterAd);
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    window.open(`/api/contacts/export?${params.toString()}`, '_blank');
  };

  const handleContactUpdate = (updated: Contact) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
    );
    setSelectedContact((prev) =>
      prev && prev.id === updated.id ? { ...prev, ...updated } : prev
    );
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selectedIds.size === 0) return;
    setBulkProcessing(true);
    const supabase = createClient();
    const ids = Array.from(selectedIds);
    const now = new Date().toISOString();
    const { data: { user } } = await supabase.auth.getUser();

    try {
      if (bulkAction.startsWith('stage:')) {
        const newStage = bulkAction.split(':')[1];
        // Get current stages for pipeline events
        const selectedContacts = contacts.filter(c => ids.includes(c.id));

        await supabase.from('contacts').update({ pipeline_stage: newStage, updated_at: now }).in('id', ids);

        // Insert pipeline events
        const events = selectedContacts.map(c => ({
          contact_id: c.id,
          client_id: c.client_id,
          from_stage: c.pipeline_stage,
          to_stage: newStage,
          changed_at: now,
          changed_by: user?.id ?? null,
        }));
        await supabase.from('pipeline_events').insert(events);

        // Fire pixel events
        for (const c of selectedContacts) {
          fetch('/api/meta/send-pixel-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: c.client_id, contact_id: c.id, action: `stage_${newStage}`, contact: c }),
          }).catch(() => {});
        }

        // Update local state
        setContacts(prev => prev.map(c => ids.includes(c.id) ? { ...c, pipeline_stage: newStage, updated_at: now } : c));
      } else if (bulkAction.startsWith('quality:')) {
        const quality = bulkAction.split(':')[1];
        await supabase.from('contacts').update({ lead_quality: quality, updated_at: now }).in('id', ids);

        // Fire pixel events
        const selectedContacts = contacts.filter(c => ids.includes(c.id));
        for (const c of selectedContacts) {
          fetch('/api/meta/send-pixel-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: c.client_id,
              contact_id: c.id,
              action: quality === 'good' ? 'quality_good' : 'quality_bad',
              contact: { ...c, lead_quality: quality },
            }),
          }).catch(() => {});
        }

        setContacts(prev => prev.map(c => ids.includes(c.id) ? { ...c, lead_quality: quality } : c));
      }

      setSelectedIds(new Set());
      setBulkAction('');
    } catch (err) {
      console.error('Bulk action error:', err);
    } finally {
      setBulkProcessing(false);
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) {
      return (
        <svg className="w-3 h-3 ml-1 text-text-muted inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return sortDir === 'asc' ? (
      <svg className="w-3 h-3 ml-1 text-gold inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-3 h-3 ml-1 text-gold inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  const selectClasses =
    'rounded-lg border border-dark-border bg-dark-elevated px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold transition-all duration-200';

  const columns: { label: string; key: SortKey }[] = [
    { label: 'Name', key: 'name' },
    { label: 'Phone', key: 'phone' },
    { label: 'Email', key: 'email' },
    { label: 'Source Ad', key: 'source_ad_name' },
    { label: 'Source Campaign', key: 'source_campaign_name' },
    { label: 'Stage', key: 'pipeline_stage' },
    { label: 'Quality', key: 'lead_quality' },
    { label: 'Score', key: 'lead_score' },
    { label: 'Created', key: 'created_at' },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold font-heading text-text-primary">Contacts</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddContact(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-bold text-dark hover:bg-gold-hover transition-all duration-200"
          >
            + Add Contact
          </button>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-bold text-dark hover:bg-gold-hover transition-all duration-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="mb-4">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-dark-border bg-dark-elevated pl-10 pr-4 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold transition-all duration-200"
          />
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={filterStage}
          onChange={(e) => setFilterStage(e.target.value)}
          className={selectClasses}
        >
          <option value="">All Stages</option>
          {PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>
              {PIPELINE_STAGE_LABELS[s]}
            </option>
          ))}
        </select>

        <select
          value={filterQuality}
          onChange={(e) => setFilterQuality(e.target.value)}
          className={selectClasses}
        >
          <option value="">All Quality</option>
          <option value="good">Good</option>
          <option value="bad">Bad</option>
          <option value="unset">Unset</option>
        </select>

        <select
          value={filterCampaign}
          onChange={(e) => setFilterCampaign(e.target.value)}
          className={selectClasses}
        >
          <option value="">All Campaigns</option>
          {uniqueCampaigns.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={filterAd}
          onChange={(e) => setFilterAd(e.target.value)}
          className={selectClasses}
        >
          <option value="">All Ads</option>
          {uniqueAds.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <label className="text-sm text-text-secondary">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={selectClasses}
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-text-secondary">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={selectClasses}
          />
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-dark-card border border-gold/30 rounded-lg">
          <span className="text-sm text-text-secondary font-body">{selectedIds.size} selected</span>
          <select
            value={bulkAction}
            onChange={(e) => setBulkAction(e.target.value)}
            className="rounded-lg border border-dark-border bg-dark-elevated px-3 py-1.5 text-sm text-text-primary focus:ring-2 focus:ring-gold/50"
          >
            <option value="">Choose action...</option>
            <optgroup label="Move to stage">
              {PIPELINE_STAGES.map(s => (
                <option key={s} value={`stage:${s}`}>{PIPELINE_STAGE_LABELS[s]}</option>
              ))}
            </optgroup>
            <option value="quality:good">Mark as good lead</option>
            <option value="quality:bad">Mark as bad lead</option>
          </select>
          <button
            onClick={handleBulkAction}
            disabled={!bulkAction || bulkProcessing}
            className="px-4 py-1.5 bg-gold text-dark font-bold rounded-lg text-sm hover:bg-gold-hover disabled:opacity-50 transition-all duration-200"
          >
            {bulkProcessing ? 'Processing...' : 'Apply'}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-text-muted hover:text-text-primary transition-all duration-200"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-dark-border bg-dark-card shadow-gold-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-dark-border border-t-gold" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-text-muted">
            <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm font-medium text-text-secondary">No contacts found</p>
            <p className="text-xs mt-1 text-text-muted">Try adjusting your search or filters.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-border bg-dark-elevated">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === sorted.length && sorted.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(new Set(sorted.map(c => c.id)));
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                    className="w-4 h-4 accent-gold rounded"
                  />
                </th>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:text-gold select-none whitespace-nowrap transition-all duration-200"
                  >
                    {col.label}
                    <SortIcon column={col.key} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border">
              {sorted.map((contact, i) => {
                const stageColor = PIPELINE_STAGE_COLORS[contact.pipeline_stage] as
                  | 'blue' | 'yellow' | 'purple' | 'teal' | 'green' | 'red' | 'gray';

                return (
                  <tr
                    key={contact.id}
                    onClick={() => setSelectedContact(contact)}
                    className={`${i % 2 === 0 ? 'bg-dark-card' : 'bg-dark-stripe'} hover:bg-dark-elevated cursor-pointer transition-all duration-200`}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(contact.id)}
                        onChange={(e) => {
                          const next = new Set(selectedIds);
                          if (e.target.checked) next.add(contact.id);
                          else next.delete(contact.id);
                          setSelectedIds(next);
                        }}
                        className="w-4 h-4 accent-gold rounded"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-text-primary whitespace-nowrap">
                      {contact.first_name} {contact.last_name}
                    </td>
                    <td className="px-4 py-3 text-text-secondary whitespace-nowrap">
                      {contact.phone || '---'}
                    </td>
                    <td className="px-4 py-3 text-text-secondary whitespace-nowrap">
                      {contact.email || '---'}
                    </td>
                    <td className="px-4 py-3 text-text-secondary whitespace-nowrap max-w-[180px] truncate">
                      {contact.source_ad_name || '---'}
                    </td>
                    <td className="px-4 py-3 text-text-secondary whitespace-nowrap max-w-[180px] truncate">
                      {contact.source_campaign_name || '---'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge
                        label={PIPELINE_STAGE_LABELS[contact.pipeline_stage] ?? contact.pipeline_stage}
                        color={stageColor ?? 'gray'}
                      />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {contact.lead_quality === 'good' ? (
                        <Badge label="Good" color="green" />
                      ) : contact.lead_quality === 'bad' ? (
                        <Badge label="Bad" color="red" />
                      ) : null}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {contact.lead_score != null ? (
                        <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                          contact.lead_score >= 70 ? 'bg-success/20 text-success' :
                          contact.lead_score >= 40 ? 'bg-warning/20 text-warning' :
                          'bg-dark-elevated text-text-muted'
                        }`}>
                          {contact.lead_score}
                        </span>
                      ) : (
                        <span className="text-text-muted">&mdash;</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-muted whitespace-nowrap">
                      {new Date(contact.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Count */}
      {!loading && sorted.length > 0 && (
        <p className="text-xs text-text-muted mt-3">
          Showing {sorted.length} of {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Contact Drawer */}
      {selectedContact && (
        <ContactDrawer
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
          onUpdate={handleContactUpdate}
        />
      )}

      <AddContactModal
        open={showAddContact}
        onClose={() => setShowAddContact(false)}
        onCreated={() => window.location.reload()}
      />
    </div>
  );
}
