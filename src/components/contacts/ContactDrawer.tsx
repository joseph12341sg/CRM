'use client';

import { useEffect, useState, useRef } from 'react';
import Badge from '@/components/ui/Badge';
import { PIPELINE_STAGE_LABELS, PIPELINE_STAGE_COLORS } from '@/lib/constants';
import { createClient } from '@/lib/supabase/client';

export type Contact = {
  id: string;
  client_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  source_ad_name: string | null;
  source_ad_set_name: string | null;
  source_campaign_name: string | null;
  pipeline_stage: string;
  lead_quality: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type PipelineEvent = {
  id: string;
  contact_id: string;
  from_stage: string | null;
  to_stage: string;
  changed_at: string;
};

type ContactDrawerProps = {
  contact: Contact;
  onClose: () => void;
  onUpdate: (updated: Contact) => void;
};

export default function ContactDrawer({ contact, onClose, onUpdate }: ContactDrawerProps) {
  const [notes, setNotes] = useState(contact.notes ?? '');
  const [quality, setQuality] = useState<string | null>(contact.lead_quality);
  const [stageHistory, setStageHistory] = useState<PipelineEvent[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [visible, setVisible] = useState(false);
  const notesRef = useRef(contact.notes ?? '');

  // Slide-in animation
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Fetch pipeline events
  useEffect(() => {
    const fetchHistory = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('pipeline_events')
        .select('*')
        .eq('contact_id', contact.id)
        .order('changed_at', { ascending: false });

      setStageHistory(data ?? []);
      setLoadingHistory(false);
    };
    fetchHistory();
  }, [contact.id]);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 200);
  };

  const handleNoteBlur = async () => {
    if (notes === notesRef.current) return;
    notesRef.current = notes;
    const supabase = createClient();
    await supabase
      .from('contacts')
      .update({ notes })
      .eq('id', contact.id);
    onUpdate({ ...contact, notes });
  };

  const handleQualityChange = async (newQuality: string | null) => {
    setQuality(newQuality);
    const supabase = createClient();
    await supabase
      .from('contacts')
      .update({ lead_quality: newQuality })
      .eq('id', contact.id);

    const updated = { ...contact, lead_quality: newQuality };
    onUpdate(updated);

    // Fire pixel event (fire and forget)
    if (newQuality === 'good' || newQuality === 'bad') {
      fetch('/api/meta/send-pixel-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: contact.client_id,
          contact_id: contact.id,
          action: newQuality === 'good' ? 'quality_good' : 'quality_bad',
          contact: updated,
        }),
      }).catch(() => {});
    }
  };

  const stageColor = PIPELINE_STAGE_COLORS[contact.pipeline_stage] as
    | 'blue' | 'yellow' | 'purple' | 'teal' | 'green' | 'red';

  const qualityOptions: { label: string; value: string | null }[] = [
    { label: 'Unset', value: null },
    { label: 'Good', value: 'good' },
    { label: 'Bad', value: 'bad' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/85 backdrop-blur-sm z-40 transition-opacity duration-200 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleClose}
      />

      {/* Drawer */}
      <div
        className={`fixed inset-y-0 right-0 w-[480px] max-w-full bg-dark-card border-l border-dark-border shadow-gold-md z-50 flex flex-col transition-transform duration-200 ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border">
          <h2 className="text-lg font-heading font-semibold text-text-primary truncate">
            {contact.first_name} {contact.last_name}
          </h2>
          <button
            onClick={handleClose}
            className="text-text-muted hover:text-text-primary text-2xl leading-none ml-4 transition-all duration-200"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Contact Info */}
          <section>
            <h3 className="text-xs font-semibold text-gold uppercase tracking-wider mb-3">Contact Info</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-text-muted">Full Name</p>
                <p className="text-sm text-text-primary font-medium">{contact.first_name} {contact.last_name}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Phone</p>
                <p className="text-sm text-text-primary">{contact.phone || '---'}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Email</p>
                <p className="text-sm text-text-primary">{contact.email || '---'}</p>
              </div>
            </div>
          </section>

          {/* Pipeline Stage */}
          <section>
            <h3 className="text-xs font-semibold text-gold uppercase tracking-wider mb-3">Pipeline Stage</h3>
            <Badge
              label={PIPELINE_STAGE_LABELS[contact.pipeline_stage] ?? contact.pipeline_stage}
              color={stageColor ?? 'gray'}
            />
          </section>

          {/* Source Tracking */}
          <section>
            <h3 className="text-xs font-semibold text-gold uppercase tracking-wider mb-3">Source Tracking</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-text-muted">Source Ad</p>
                <p className="text-sm text-text-primary">{contact.source_ad_name || '---'}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Source Ad Set</p>
                <p className="text-sm text-text-primary">{contact.source_ad_set_name || '---'}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Source Campaign</p>
                <p className="text-sm text-text-primary">{contact.source_campaign_name || '---'}</p>
              </div>
            </div>
          </section>

          {/* Lead Quality Toggle */}
          <section>
            <h3 className="text-xs font-semibold text-gold uppercase tracking-wider mb-3">Lead Quality</h3>
            <div className="flex rounded-lg overflow-hidden border border-dark-border">
              {qualityOptions.map((opt) => {
                const isActive = quality === opt.value;
                let activeClass = 'bg-dark-elevated text-text-secondary font-medium';
                if (isActive && opt.value === 'good') activeClass = 'bg-success text-dark font-medium';
                if (isActive && opt.value === 'bad') activeClass = 'bg-danger text-dark font-medium';

                return (
                  <button
                    key={opt.label}
                    onClick={() => handleQualityChange(opt.value)}
                    className={`flex-1 px-4 py-2 text-sm transition-all duration-200 ${
                      isActive ? activeClass : 'bg-dark-card text-text-muted hover:bg-dark-elevated'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Notes */}
          <section>
            <h3 className="text-xs font-semibold text-gold uppercase tracking-wider mb-3">Notes</h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleNoteBlur}
              rows={4}
              placeholder="Add notes about this contact..."
              className="w-full rounded-lg border border-dark-border bg-dark-elevated px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold resize-none transition-all duration-200"
            />
          </section>

          {/* Stage History */}
          <section>
            <h3 className="text-xs font-semibold text-gold uppercase tracking-wider mb-3">Stage History</h3>
            {loadingHistory ? (
              <p className="text-sm text-text-muted">Loading history...</p>
            ) : stageHistory.length === 0 ? (
              <p className="text-sm text-text-muted">No stage changes recorded.</p>
            ) : (
              <div className="space-y-3">
                {stageHistory.map((event) => (
                  <div key={event.id} className="flex items-center gap-2 text-sm">
                    <span className="text-text-secondary">
                      {event.from_stage
                        ? PIPELINE_STAGE_LABELS[event.from_stage] ?? event.from_stage
                        : '(none)'}
                    </span>
                    <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="font-medium text-text-primary">
                      {PIPELINE_STAGE_LABELS[event.to_stage] ?? event.to_stage}
                    </span>
                    <span className="text-text-muted text-xs ml-auto">
                      {new Date(event.changed_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Created at */}
          <section>
            <h3 className="text-xs font-semibold text-gold uppercase tracking-wider mb-2">Date Created</h3>
            <p className="text-sm text-text-primary">
              {new Date(contact.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
