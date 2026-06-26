import { useEffect, useState } from 'react';
import {
  createSocialPost,
  deleteSocialPost,
  fetchSocialPosts,
  updateSocialPost,
  type PartnershipSocialPost,
  type SocialPlatform,
  type SocialStatus,
} from '@/lib/partnerships-tabs';

const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  facebook: 'FB',
  instagram: 'IG',
  both: 'Both',
};

const PLATFORM_CHIP: Record<SocialPlatform, string> = {
  facebook: 'bg-blue-100 text-blue-700',
  instagram: 'bg-pink-100 text-pink-700',
  both: 'bg-purple-100 text-purple-700',
};

const STATUS_LABEL: Record<SocialStatus, string> = {
  planned: 'Planned',
  scheduled: 'Scheduled',
  posted: 'Posted',
};

const STATUS_CHIP: Record<SocialStatus, string> = {
  planned: 'bg-slate-100 text-slate-600',
  scheduled: 'bg-amber-100 text-amber-700',
  posted: 'bg-sparrow-green/10 text-sparrow-green',
};

const STATUS_CYCLE: SocialStatus[] = ['planned', 'scheduled', 'posted'];

function nextStatus(s: SocialStatus): SocialStatus {
  const idx = STATUS_CYCLE.indexOf(s);
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
}

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const EMPTY_FORM = {
  platform: 'both' as SocialPlatform,
  content_idea: '',
  planned_date: '',
  notes: '',
};

export function PartnershipSocialTab() {
  const [posts, setPosts] = useState<PartnershipSocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [postedOpen, setPostedOpen] = useState(false);

  function load() {
    setLoading(true);
    fetchSocialPosts()
      .then(setPosts)
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.content_idea.trim()) return;
    setSaving(true);
    try {
      await createSocialPost({
        platform: form.platform,
        content_idea: form.content_idea,
        planned_date: form.planned_date || null,
        notes: form.notes || null,
      });
      setForm(EMPTY_FORM);
      setShowAddForm(false);
      load();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  function handleCycleStatus(post: PartnershipSocialPost) {
    const next = nextStatus(post.status);
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, status: next } : p)));
    updateSocialPost(post.id, { status: next }).catch(console.error);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this post idea?')) return;
    await deleteSocialPost(id).catch(console.error);
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  const todayISO = new Date().toISOString().slice(0, 10);

  const upcoming = posts
    .filter((p) => p.status === 'planned' || p.status === 'scheduled')
    .sort((a, b) => (a.planned_date ?? '').localeCompare(b.planned_date ?? ''));

  const posted = posts
    .filter((p) => p.status === 'posted')
    .sort((a, b) => (b.planned_date ?? '').localeCompare(a.planned_date ?? ''));

  // Warning: no upcoming post in 14 days AND last posted is more than 14 days ago (or none)
  const lastPostedDate = posted[0]?.planned_date ?? null;
  const earliestUpcomingDate = upcoming[0]?.planned_date ?? null;
  const lastPostedDaysAgo = lastPostedDate
    ? (new Date(todayISO).getTime() - new Date(lastPostedDate).getTime()) / 86_400_000
    : Infinity;
  const daysToNextPost = earliestUpcomingDate
    ? (new Date(earliestUpcomingDate).getTime() - new Date(todayISO).getTime()) / 86_400_000
    : Infinity;
  const showFrequencyWarning = lastPostedDaysAgo > 14 || daysToNextPost > 14;

  return (
    <div className="space-y-4">
      {/* Frequency warning */}
      {showFrequencyWarning && !loading && (
        <div className="rounded-xl border border-sparrow-gold/40 bg-sparrow-gold/5 px-4 py-3 text-sm text-sparrow-ink">
          No post planned in the next 14 days. Minimum posting frequency is every 2 weeks.
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-sparrow-ink">Upcoming posts</h3>
        <button onClick={() => setShowAddForm((v) => !v)} className="btn-primary text-xs">
          {showAddForm ? 'Cancel' : '+ Add post'}
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <form onSubmit={handleAdd} className="rounded-xl border border-sparrow-rule bg-white p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Platform</label>
              <select
                className="field-input w-full"
                value={form.platform}
                onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value as SocialPlatform }))}
              >
                <option value="both">Both (FB + IG)</option>
                <option value="facebook">Facebook only</option>
                <option value="instagram">Instagram only</option>
              </select>
            </div>
            <div>
              <label className="field-label">Planned date</label>
              <input
                type="date"
                className="field-input w-full"
                value={form.planned_date}
                onChange={(e) => setForm((f) => ({ ...f, planned_date: e.target.value }))}
              />
            </div>
            <div className="col-span-2">
              <label className="field-label">Content idea *</label>
              <textarea
                className="field-input w-full resize-none"
                rows={2}
                required
                value={form.content_idea}
                onChange={(e) => setForm((f) => ({ ...f, content_idea: e.target.value }))}
              />
            </div>
            <div className="col-span-2">
              <label className="field-label">Notes (optional)</label>
              <input
                className="field-input w-full"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowAddForm(false)} className="btn-ghost text-sm">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary text-sm">
              {saving ? 'Saving…' : 'Add post'}
            </button>
          </div>
        </form>
      )}

      {loading && <p className="py-8 text-center text-sm text-sparrow-gray">Loading…</p>}

      {/* Upcoming list */}
      {!loading && upcoming.length === 0 && (
        <p className="rounded-xl border border-dashed border-sparrow-rule p-8 text-center text-sm text-sparrow-gray">
          No upcoming posts. Add one above.
        </p>
      )}

      {!loading && upcoming.length > 0 && (
        <ul className="divide-y divide-sparrow-rule overflow-hidden rounded-xl border border-sparrow-rule bg-white">
          {upcoming.map((post) => (
            <li key={post.id} className="flex items-start gap-3 px-4 py-3">
              <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${PLATFORM_CHIP[post.platform]}`}>
                {PLATFORM_LABEL[post.platform]}
              </span>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-sparrow-ink">{post.content_idea}</p>
                {post.notes && <p className="text-xs text-sparrow-gray mt-0.5">{post.notes}</p>}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-sparrow-gray whitespace-nowrap">{shortDate(post.planned_date)}</span>
                <button
                  onClick={() => handleCycleStatus(post)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_CHIP[post.status]}`}
                >
                  {STATUS_LABEL[post.status]}
                </button>
                <button
                  onClick={() => handleDelete(post.id)}
                  className="text-xs text-sparrow-gray hover:text-priority-p1"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Posted section */}
      {!loading && posted.length > 0 && (
        <div>
          <button
            onClick={() => setPostedOpen((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-sparrow-gray hover:text-sparrow-ink"
          >
            <span>{posted.length} past post{posted.length !== 1 ? 's' : ''}</span>
            <span>{postedOpen ? '▲' : '▼'}</span>
          </button>

          {postedOpen && (
            <ul className="mt-2 divide-y divide-sparrow-rule overflow-hidden rounded-xl border border-sparrow-rule bg-white">
              {posted.map((post) => (
                <li key={post.id} className="flex items-start gap-3 px-4 py-3 opacity-70">
                  <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${PLATFORM_CHIP[post.platform]}`}>
                    {PLATFORM_LABEL[post.platform]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-sparrow-ink">{post.content_idea}</p>
                    {post.notes && <p className="text-xs text-sparrow-gray mt-0.5">{post.notes}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-sparrow-gray">{shortDate(post.planned_date)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
