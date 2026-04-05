'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Template = {
  id: string;
  name: string;
  template_body: string;
};

type AdVersion = {
  id: string;
  version_number: number;
  ad_copy: string | null;
  prompt_used: string | null;
  saved_at: string;
};

function extractPlaceholders(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, ''))));
}

export default function EditAdPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
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
  const [versionNumber, setVersionNumber] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);

  // Version history
  const [versions, setVersions] = useState<AdVersion[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<AdVersion | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const placeholders = selectedTemplate
    ? extractPlaceholders(selectedTemplate.template_body)
    : [];

  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      // Fetch templates
      const { data: templateData } = await supabase
        .from('ad_templates')
        .select('id, name, template_body')
        .order('name');
      if (templateData) setTemplates(templateData);

      // Fetch ad
      const { data: ad, error } = await supabase
        .from('ads')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !ad) {
        router.push('/dashboard/ads');
        return;
      }

      setName(ad.name || '');
      setAdCopy(ad.ad_copy || '');
      setImageUrl(ad.image_url || '');
      setCampaignId(ad.campaign_id || '');
      setAdSetId(ad.ad_set_id || '');
      setAdId(ad.ad_id || '');
      setStatus(ad.status || 'draft');
      setVersionNumber(ad.version_number || 1);

      // Fetch versions
      const { data: versionData } = await supabase
        .from('ad_versions')
        .select('id, version_number, ad_copy, prompt_used, saved_at')
        .eq('ad_id', id)
        .order('version_number', { ascending: false });

      if (versionData) setVersions(versionData as AdVersion[]);

      setLoading(false);
    }

    fetchData();
  }, [id]);

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
      const newVersion = versionNumber + 1;

      // Update ad
      const { error: updateError } = await supabase
        .from('ads')
        .update({
          name: name.trim(),
          ad_copy: adCopy,
          image_url: imageUrl || null,
          campaign_id: campaignId || null,
          ad_set_id: adSetId || null,
          ad_id: adId || null,
          status,
          version_number: newVersion,
        })
        .eq('id', id);

      if (updateError) {
        console.error('Error updating ad:', updateError);
        setSaving(false);
        return;
      }

      // Insert new version
      await supabase.from('ad_versions').insert({
        ad_id: id,
        client_id: user.id,
        ad_copy: adCopy,
        prompt_used: promptUsed || null,
        version_number: newVersion,
      });

      setVersionNumber(newVersion);

      // Refresh versions
      const { data: versionData } = await supabase
        .from('ad_versions')
        .select('id, version_number, ad_copy, prompt_used, saved_at')
        .eq('ad_id', id)
        .order('version_number', { ascending: false });

      if (versionData) setVersions(versionData as AdVersion[]);

      router.push('/dashboard/ads');
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    setArchiving(true);
    try {
      await supabase.from('ads').update({ status: 'archived' }).eq('id', id);
      setStatus('archived');
      router.push('/dashboard/ads');
    } catch (err) {
      console.error('Archive error:', err);
    } finally {
      setArchiving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gold border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-navy">Edit Ad</h1>
        <button
          onClick={handleArchive}
          disabled={archiving || status === 'archived'}
          className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {archiving ? 'Archiving...' : status === 'archived' ? 'Archived' : 'Archive Ad'}
        </button>
      </div>

      <div className="space-y-6">
        {/* Ad name */}
        <div>
          <label className="block text-sm font-medium text-navy mb-1">
            Ad Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter ad name"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gold focus:ring-gold"
          />
        </div>

        {/* Template selector */}
        <div>
          <label className="block text-sm font-medium text-navy mb-1">
            Template
          </label>
          <select
            value={selectedTemplateId}
            onChange={(e) => {
              setSelectedTemplateId(e.target.value);
              setPlaceholderValues({});
            }}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gold focus:ring-gold"
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
          <div className="rounded-md border border-gray-200 bg-gray-50 p-4 space-y-3">
            <p className="text-sm font-medium text-navy">Template Variables</p>
            {placeholders.map((key) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 mb-1 capitalize">
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
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gold focus:ring-gold"
                />
              </div>
            ))}

            {/* Template preview */}
            <div className="mt-2 rounded bg-white p-3 text-sm text-gray-700 whitespace-pre-wrap border border-gray-200">
              {buildFilledTemplate()}
            </div>
          </div>
        )}

        {/* Generate button */}
        <div>
          <button
            onClick={handleGenerate}
            disabled={generating || !selectedTemplate}
            className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {generating && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            )}
            {generating ? 'Generating...' : 'Generate Copy with AI'}
          </button>
        </div>

        {/* Ad copy textarea */}
        <div>
          <label className="block text-sm font-medium text-navy mb-1">
            Ad Copy
          </label>
          <textarea
            value={adCopy}
            onChange={(e) => setAdCopy(e.target.value)}
            rows={8}
            placeholder="Your ad copy will appear here after generation, or type it manually"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gold focus:ring-gold"
          />
        </div>

        {/* Image URL */}
        <div>
          <label className="block text-sm font-medium text-navy mb-1">
            Image URL
          </label>
          <input
            type="text"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://example.com/image.png"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gold focus:ring-gold"
          />
        </div>

        {/* Meta IDs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-navy mb-1">
              Campaign ID
            </label>
            <input
              type="text"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              placeholder="Meta Campaign ID"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gold focus:ring-gold"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-navy mb-1">
              Ad Set ID
            </label>
            <input
              type="text"
              value={adSetId}
              onChange={(e) => setAdSetId(e.target.value)}
              placeholder="Meta Ad Set ID"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gold focus:ring-gold"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-navy mb-1">
              Ad ID
            </label>
            <input
              type="text"
              value={adId}
              onChange={(e) => setAdId(e.target.value)}
              placeholder="Meta Ad ID"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gold focus:ring-gold"
            />
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-navy mb-1">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gold focus:ring-gold"
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="rounded-md bg-gold px-6 py-2 text-sm font-semibold text-navy hover:bg-gold-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-navy border-t-transparent" />
            )}
            {saving ? 'Saving...' : 'Save Ad'}
          </button>
          <button
            onClick={() => router.push('/dashboard/ads')}
            className="rounded-md border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <span className="ml-auto text-xs text-gray-400">
            Version {versionNumber}
          </span>
        </div>

        {/* Version History */}
        <div className="border-t border-gray-200 pt-6">
          <button
            onClick={() => setVersionsOpen(!versionsOpen)}
            className="flex items-center gap-2 text-sm font-medium text-navy hover:text-navy-400 transition-colors"
          >
            <svg
              className={`h-4 w-4 transition-transform ${versionsOpen ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            Version History ({versions.length} version{versions.length !== 1 ? 's' : ''})
          </button>

          {versionsOpen && (
            <div className="mt-4 space-y-3">
              {versions.length === 0 ? (
                <p className="text-sm text-gray-500">No versions recorded yet.</p>
              ) : (
                versions.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-navy">
                        Version {v.version_number}
                      </p>
                      <p className="text-xs text-gray-500">
                        {v.saved_at
                          ? new Date(v.saved_at).toLocaleString()
                          : 'Unknown date'}
                      </p>
                    </div>
                    <button
                      onClick={() => setPreviewVersion(v)}
                      className="rounded-md border border-navy px-3 py-1 text-xs font-medium text-navy hover:bg-navy-50 transition-colors"
                    >
                      Preview
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Version Preview Modal */}
      {previewVersion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-xl rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-navy">
                Version {previewVersion.version_number}
              </h2>
              <button
                onClick={() => setPreviewVersion(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4 max-h-80 overflow-y-auto">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {previewVersion.ad_copy || 'No copy for this version.'}
              </p>
            </div>
            {previewVersion.prompt_used && (
              <div className="mt-3">
                <p className="text-xs font-medium text-gray-500 mb-1">Prompt used:</p>
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3 max-h-32 overflow-y-auto">
                  <p className="text-xs text-gray-600 whitespace-pre-wrap">
                    {previewVersion.prompt_used}
                  </p>
                </div>
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setPreviewVersion(null)}
                className="rounded-md bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-400 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
