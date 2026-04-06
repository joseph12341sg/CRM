'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Template = {
  id: string;
  name: string;
  template_body: string;
};

function extractPlaceholders(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, ''))));
}

export default function CreateAdPage() {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>({});
  const [adCopy, setAdCopy] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [adSetId, setAdSetId] = useState('');
  const [adId, setAdId] = useState('');
  const [status, setStatus] = useState<string>('draft');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const placeholders = selectedTemplate
    ? extractPlaceholders(selectedTemplate.template_body)
    : [];

  useEffect(() => {
    async function fetchTemplates() {
      const { data } = await supabase
        .from('ad_templates')
        .select('id, name, template_body')
        .order('name');
      if (data) setTemplates(data);
    }
    fetchTemplates();
  }, []);

  function buildFilledTemplate(): string {
    if (!selectedTemplate) return '';
    let text = selectedTemplate.template_body;
    for (const key of placeholders) {
      text = text.replaceAll(`{{${key}}}`, placeholderValues[key] || `{{${key}}}`);
    }
    return text;
  }

  async function handleGenerate() {
    const prompt = buildFilledTemplate();
    if (!prompt) return;

    setGenerating(true);
    setAdCopy('');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/ads/generate-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setGenerating(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setAdCopy(accumulated);
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Generate copy error:', err);
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      const promptUsed = buildFilledTemplate();

      // Insert ad
      const { data: ad, error: adError } = await supabase
        .from('ads')
        .insert({
          client_id: user.id,
          name: name.trim(),
          ad_copy: adCopy,
          image_url: imageUrl || null,
          campaign_id: campaignId || null,
          ad_set_id: adSetId || null,
          ad_id: adId || null,
          status,
          version_number: 1,
        })
        .select('id')
        .single();

      if (adError || !ad) {
        console.error('Error creating ad:', adError);
        setSaving(false);
        return;
      }

      // Insert first version
      await supabase.from('ad_versions').insert({
        ad_id: ad.id,
        client_id: user.id,
        ad_copy: adCopy,
        prompt_used: promptUsed || null,
        version_number: 1,
      });

      router.push('/dashboard/ads');
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold font-heading text-text-primary mb-8">Create New Ad</h1>

      <div className="space-y-6">
        {/* Ad name */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Ad Name <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter ad name"
            className="w-full rounded-md border border-dark-border bg-dark-elevated px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-gold focus:ring-gold transition-all duration-200"
          />
        </div>

        {/* Template selector */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Template
          </label>
          <select
            value={selectedTemplateId}
            onChange={(e) => {
              setSelectedTemplateId(e.target.value);
              setPlaceholderValues({});
            }}
            className="w-full rounded-md border border-dark-border bg-dark-elevated px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-gold focus:ring-gold transition-all duration-200"
          >
            <option value="">Select a template...</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Placeholder fields */}
        {selectedTemplate && placeholders.length > 0 && (
          <div className="rounded-md border border-dark-border bg-dark-elevated p-4 space-y-3">
            <p className="text-sm font-medium text-gold">Template Variables</p>
            {placeholders.map((key) => (
              <div key={key}>
                <label className="block text-xs font-medium text-text-muted mb-1 capitalize">
                  {key.replace(/_/g, ' ')}
                </label>
                <input
                  type="text"
                  value={placeholderValues[key] || ''}
                  onChange={(e) =>
                    setPlaceholderValues((prev) => ({
                      ...prev,
                      [key]: e.target.value,
                    }))
                  }
                  placeholder={`Enter ${key.replace(/_/g, ' ')}`}
                  className="w-full rounded-md border border-dark-border bg-dark-elevated px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-gold focus:ring-gold transition-all duration-200"
                />
              </div>
            ))}

            {/* Template preview */}
            <div className="mt-2 rounded bg-dark-card p-3 text-sm text-text-secondary whitespace-pre-wrap border border-dark-border">
              {buildFilledTemplate()}
            </div>
          </div>
        )}

        {/* Generate button */}
        <div>
          <button
            onClick={handleGenerate}
            disabled={generating || !selectedTemplate}
            className="rounded-md border border-gold text-gold px-4 py-2 text-sm font-bold hover:bg-gold hover:text-dark transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {generating && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold border-t-transparent" />
            )}
            {generating ? 'Generating...' : 'Generate Copy with AI'}
          </button>
        </div>

        {/* Ad copy textarea */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Ad Copy
          </label>
          <textarea
            value={adCopy}
            onChange={(e) => setAdCopy(e.target.value)}
            rows={8}
            placeholder="Your ad copy will appear here after generation, or type it manually"
            className="w-full rounded-md border border-dark-border bg-dark-elevated px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-gold focus:ring-gold transition-all duration-200"
          />
        </div>

        {/* Image URL */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Image URL
          </label>
          <input
            type="text"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://example.com/image.png"
            className="w-full rounded-md border border-dark-border bg-dark-elevated px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-gold focus:ring-gold transition-all duration-200"
          />
        </div>

        {/* Meta IDs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Campaign ID
            </label>
            <input
              type="text"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              placeholder="Meta Campaign ID"
              className="w-full rounded-md border border-dark-border bg-dark-elevated px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-gold focus:ring-gold transition-all duration-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Ad Set ID
            </label>
            <input
              type="text"
              value={adSetId}
              onChange={(e) => setAdSetId(e.target.value)}
              placeholder="Meta Ad Set ID"
              className="w-full rounded-md border border-dark-border bg-dark-elevated px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-gold focus:ring-gold transition-all duration-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Ad ID
            </label>
            <input
              type="text"
              value={adId}
              onChange={(e) => setAdId(e.target.value)}
              placeholder="Meta Ad ID"
              className="w-full rounded-md border border-dark-border bg-dark-elevated px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-gold focus:ring-gold transition-all duration-200"
            />
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-md border border-dark-border bg-dark-elevated px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-gold focus:ring-gold transition-all duration-200"
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-4 border-t border-dark-border">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="rounded-md bg-gold px-6 py-2 text-sm font-bold text-dark hover:bg-gold-hover transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-dark border-t-transparent" />
            )}
            {saving ? 'Saving...' : 'Save Ad'}
          </button>
          <button
            onClick={() => router.push('/dashboard/ads')}
            className="rounded-md border border-gold px-6 py-2 text-sm font-medium text-gold hover:bg-gold hover:text-dark transition-all duration-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
