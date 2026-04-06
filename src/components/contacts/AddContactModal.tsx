'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PIPELINE_STAGES, PIPELINE_STAGE_LABELS } from '@/lib/constants';

type AddContactModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export default function AddContactModal({ open, onClose, onCreated }: AddContactModalProps) {
  const supabase = createClient();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState('new_lead');
  const [campaignName, setCampaignName] = useState('');
  const [campaigns, setCampaigns] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Fetch unique campaign names from recent snapshots
    async function fetchCampaigns() {
      const { data } = await supabase
        .from('meta_snapshots')
        .select('campaign_name')
        .order('snapshot_date', { ascending: false })
        .limit(200);
      if (data) {
        const unique = Array.from(new Set(data.map(r => r.campaign_name).filter(Boolean))) as string[];
        setCampaigns(unique);
      }
    }
    fetchCampaigns();
  }, [open]);

  if (!open) return null;

  const handleSave = async () => {
    if (!firstName.trim()) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: contact } = await supabase
        .from('contacts')
        .insert({
          client_id: user.id,
          first_name: firstName.trim(),
          last_name: lastName.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          pipeline_stage: stage,
          source_campaign_name: campaignName || null,
          fb_lead_id: null,
        })
        .select('id')
        .single();

      if (contact) {
        await supabase.from('pipeline_events').insert({
          contact_id: contact.id,
          client_id: user.id,
          from_stage: null,
          to_stage: stage,
          changed_at: new Date().toISOString(),
          changed_by: user.id,
        });
      }

      setFirstName('');
      setLastName('');
      setPhone('');
      setEmail('');
      setStage('new_lead');
      setCampaignName('');
      onCreated();
      onClose();
    } catch (err) {
      console.error('Failed to add contact:', err);
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 bg-dark-elevated border border-dark-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:ring-2 focus:ring-gold/50 focus:border-gold outline-none transition-all duration-200';

  return (
    <>
      <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-dark-card border border-dark-border rounded-xl shadow-gold-md p-6 w-full max-w-md">
          <h3 className="text-lg font-bold font-heading text-text-primary mb-4">Add Contact</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">First Name *</label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Last Name</label>
                <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" className={inputClass} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Phone</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+44..." className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Pipeline Stage</label>
              <select value={stage} onChange={e => setStage(e.target.value)} className={inputClass}>
                {PIPELINE_STAGES.map(s => (
                  <option key={s} value={s}>{PIPELINE_STAGE_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Campaign Attribution</label>
              <select value={campaignName} onChange={e => setCampaignName(e.target.value)} className={inputClass}>
                <option value="">None</option>
                {campaigns.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-all duration-200">Cancel</button>
            <button
              onClick={handleSave}
              disabled={!firstName.trim() || saving}
              className="px-4 py-2 text-sm font-bold text-dark bg-gold rounded-lg hover:bg-gold-hover disabled:opacity-50 transition-all duration-200"
            >
              {saving ? 'Adding...' : 'Add Contact'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
