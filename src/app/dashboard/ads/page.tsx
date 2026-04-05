'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Badge from '@/components/ui/Badge';

type Ad = {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  ad_copy: string | null;
  image_url: string | null;
  campaign_id: string | null;
  created_at: string;
};

const statusBadgeColor: Record<Ad['status'], 'gray' | 'green' | 'yellow' | 'red'> = {
  draft: 'gray',
  active: 'green',
  paused: 'yellow',
  archived: 'red',
};

export default function AdsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    async function fetchAds() {
      setLoading(true);
      let query = supabase
        .from('ads')
        .select('id, name, status, ad_copy, image_url, campaign_id, created_at')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (!error && data) {
        setAds(data as Ad[]);
      }
      setLoading(false);
    }
    fetchAds();
  }, [statusFilter]);

  const visibleAds = showArchived
    ? ads
    : ads.filter((ad) => ad.status !== 'archived');

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <h1 className="text-2xl font-bold text-navy">Ad Library</h1>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gold focus:ring-gold"
          >
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>

          {/* Show archived toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-gray-300 text-gold focus:ring-gold"
            />
            Show Archived
          </label>

          {/* Create button */}
          <button
            onClick={() => router.push('/dashboard/ads/create')}
            className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-navy hover:bg-gold-300 transition-colors"
          >
            + Create Ad
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gold border-t-transparent" />
        </div>
      ) : visibleAds.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-500 text-lg">No ads yet. Create your first ad!</p>
          <button
            onClick={() => router.push('/dashboard/ads/create')}
            className="mt-4 rounded-md bg-gold px-5 py-2 text-sm font-semibold text-navy hover:bg-gold-300 transition-colors"
          >
            + Create Ad
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleAds.map((ad) => (
            <div
              key={ad.id}
              className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Image thumbnail */}
              {ad.image_url && (
                <div className="mb-3">
                  <img
                    src={ad.image_url}
                    alt={ad.name}
                    className="h-32 w-full rounded-md object-cover"
                  />
                </div>
              )}

              {/* Name + badge */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-bold text-navy truncate">{ad.name}</h3>
                <Badge
                  label={ad.status.charAt(0).toUpperCase() + ad.status.slice(1)}
                  color={statusBadgeColor[ad.status]}
                />
              </div>

              {/* Campaign */}
              <p className="text-xs text-gray-500 mb-2">
                {ad.campaign_id ? `Campaign: ${ad.campaign_id}` : 'No campaign'}
              </p>

              {/* Copy preview */}
              {ad.ad_copy && (
                <p className="text-sm text-gray-700 mb-4 line-clamp-3">
                  {ad.ad_copy.length > 100
                    ? ad.ad_copy.slice(0, 100) + '...'
                    : ad.ad_copy}
                </p>
              )}

              {/* Edit button */}
              <button
                onClick={() => router.push(`/dashboard/ads/${ad.id}/edit`)}
                className="w-full rounded-md border border-navy bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-400 transition-colors"
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
