// Partnerships Room — Social Media tab: post ideas, what's planned, and what's gone up.
// Same table engine and look as the Directory and Collateral; every cell edits in place.
// The posting rhythm is fixed (migration 0212): aim to post at least every two weeks. When
// nothing has gone up in two weeks and nothing is planned for the next two, the reminder
// owner gets a task and it shows on Home.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRequiredFields } from '@/hooks/useRequiredFields';
import { localDate } from '@/lib/date';
import { assignAvatarColors } from '@/lib/avatarColors';
import type { Profile } from '@/lib/types';
import {
  SOCIAL_RHYTHM_DAYS,
  createSocialPost,
  deleteSocialPost,
  fetchRecurringSetting,
  fetchSocialPosts,
  syncSocialPostReminder,
  updateRecurringSetting,
  updateSocialPost,
  type PartnershipRecurringSetting,
  type PartnershipSocialPost,
  type SocialPlatform,
  type SocialStatus,
} from '@/lib/partnerships-tabs';
import {
  useColumnLayout, useHeaderInteractions, GridTableShell,
  InlineText, InlineSelect, ExpandableText,
  type GridColumn,
} from '@/components/gridtable/GridTable';

type ColKey = 'date' | 'platform' | 'idea' | 'status' | 'notes' | 'actions';

const COLUMNS: GridColumn<ColKey>[] = [
  { key: 'date', label: 'Date', defaultWidth: 160 },
  { key: 'platform', label: 'Platform', defaultWidth: 150 },
  { key: 'idea', label: 'Post idea', defaultWidth: 360 },
  { key: 'status', label: 'Status', defaultWidth: 130 },
  { key: 'notes', label: 'Notes', defaultWidth: 280 },
  { key: 'actions', label: '', defaultWidth: 80 },
];

const SORTABLE: ColKey[] = ['date', 'platform', 'idea', 'status'];

const PLATFORM_OPTIONS: { value: SocialPlatform; label: string }[] = [
  { value: 'both', label: 'Both (FB + IG)' },
  { value: 'facebook', label: 'Facebook only' },
  { value: 'instagram', label: 'Instagram only' },
];

const STATUS_OPTIONS: { value: SocialStatus; label: string }[] = [
  { value: 'planned', label: 'Planned' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'posted', label: 'Posted' },
];

const STATUS_ORDER: Record<SocialStatus, number> = { planned: 0, scheduled: 1, posted: 2 };

const DAY_MS = 86_400_000;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(`${toIso}T12:00:00`).getTime() - new Date(`${fromIso}T12:00:00`).getTime()) / DAY_MS);
}

const EMPTY_FORM = {
  platform: 'both' as SocialPlatform,
  content_idea: '',
  planned_date: '',
  notes: '',
};

/** Clicks inside an editable cell shouldn't bubble to the row. */
function Stop({ children }: { children: ReactNode }) {
  return <div className="w-full" onClick={(e) => e.stopPropagation()}>{children}</div>;
}

export function PartnershipSocialTab({ profiles }: { profiles: Profile[] }) {
  const [posts, setPosts] = useState<PartnershipSocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [setting, setSetting] = useState<PartnershipRecurringSetting | null>(null);

  const { fieldClass, fieldError, clear, validate } = useRequiredFields([
    { key: 'pst-content-idea', label: 'Post idea', valid: form.content_idea.trim().length > 0 },
  ]);

  // Same standing-owner rule as the Directory: Partnerships staff + anyone granted room
  // access, never Exec.
  const ownerProfiles = profiles.filter(
    (p) => (p.department === 'partnerships' || p.partnerships_access) && p.department !== 'exec',
  );
  const ownerColors = useMemo(() => assignAvatarColors(profiles), [profiles]);

  function load() {
    setLoading(true);
    fetchSocialPosts()
      .then(setPosts)
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    syncSocialPostReminder().catch(console.error);
    fetchRecurringSetting('social_post').then(setSetting).catch(console.error);
  }, []);

  async function patch(post: PartnershipSocialPost, update: Partial<Pick<PartnershipSocialPost, 'platform' | 'content_idea' | 'planned_date' | 'status' | 'notes'>>) {
    setSaveError(null);
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, ...update } : p)));
    try {
      await updateSocialPost(post.id, update);
      if ('status' in update || 'planned_date' in update) await syncSocialPostReminder();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save that change.');
      load();
    }
  }

  // Marking a post Posted: if it has no date yet, or a date still ahead, it went up today.
  function changeStatus(post: PartnershipSocialPost, status: SocialStatus) {
    const today = localDate();
    if (status === 'posted' && (!post.planned_date || post.planned_date > today)) {
      void patch(post, { status, planned_date: today });
    } else {
      void patch(post, { status });
    }
  }

  async function changeOwner(ownerId: string) {
    if (!ownerId || !setting) return;
    setSetting({ ...setting, owner_id: ownerId });
    try {
      await updateRecurringSetting('social_post', { owner_id: ownerId });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not change the reminder owner.');
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setFormError(null);
    setSaving(true);
    try {
      await createSocialPost({
        platform: form.platform,
        content_idea: form.content_idea.trim(),
        planned_date: form.planned_date || null,
        notes: form.notes.trim() || null,
      });
      await syncSocialPostReminder().catch(console.error);
      setForm(EMPTY_FORM);
      setShowAddForm(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add the post.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(post: PartnershipSocialPost) {
    if (!confirm(`Delete "${post.content_idea}"? This can't be undone.`)) return;
    try {
      await deleteSocialPost(post.id);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      await syncSocialPostReminder();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not delete the post.');
    }
  }

  const today = localDate();
  const upcoming = posts.filter((p) => p.status !== 'posted');
  const past = posts.filter((p) => p.status === 'posted');

  // Same rule as emit_social_post_reminder() (0212).
  const lastPosted = past.map((p) => p.planned_date).filter((d): d is string => !!d).sort().at(-1) ?? null;
  const nextPlanned = upcoming.map((p) => p.planned_date).filter((d): d is string => !!d && d >= today).sort()[0] ?? null;
  const gapOpen =
    (!lastPosted || daysBetween(lastPosted, today) > SOCIAL_RHYTHM_DAYS)
    && (!nextPlanned || daysBetween(today, nextPlanned) > SOCIAL_RHYTHM_DAYS);

  const ownerName = setting ? profiles.find((p) => p.id === setting.owner_id)?.full_name ?? 'the reminder owner' : 'the reminder owner';

  // ── Table layout + sort (same engine as the Directory) ──
  const layout = useColumnLayout(COLUMNS, 'sparrow-partnerships-social-table');
  const [sortKey, setSortKey] = useState<ColKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const { startResize, handleHeaderClick: rawHeaderClick } = useHeaderInteractions(
    layout.colWidths, layout.setColWidths, sortKey, setSortKey, sortDir, setSortDir,
  );
  function handleHeaderClick(key: ColKey) {
    if (SORTABLE.includes(key)) rawHeaderClick(key);
  }

  const rows = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const sortGroup = (list: PartnershipSocialPost[]) => [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'platform': cmp = a.platform.localeCompare(b.platform); break;
        case 'idea': cmp = a.content_idea.localeCompare(b.content_idea); break;
        case 'status': cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]; break;
        default:
          // Undated ideas sit after dated posts either way.
          if (!a.planned_date || !b.planned_date) return (a.planned_date ? -1 : 1) - (b.planned_date ? -1 : 1);
          cmp = a.planned_date.localeCompare(b.planned_date);
      }
      return cmp * dir;
    });
    // Past posts always sit below upcoming ones, newest first.
    const pastSorted = [...past].sort((a, b) => (b.planned_date ?? '').localeCompare(a.planned_date ?? ''));
    return [...sortGroup(upcoming), ...(showPast ? pastSorted : [])];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, showPast, sortKey, sortDir]);

  function renderCell(post: PartnershipSocialPost, key: ColKey): ReactNode {
    switch (key) {
      case 'date': {
        const overdue = post.status !== 'posted' && !!post.planned_date && post.planned_date < today;
        return (
          <Stop>
            <div className="flex w-full flex-col gap-0.5">
              <InlineText
                type="date"
                value={post.planned_date ?? ''}
                onSave={(v) => void patch(post, { planned_date: v || null })}
              />
              {!post.planned_date && <span className="px-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">No date yet</span>}
              {overdue && <span className="px-1 text-xs font-medium text-priority-p1">Date passed — posted?</span>}
            </div>
          </Stop>
        );
      }
      case 'platform':
        return (
          <Stop>
            <InlineSelect value={post.platform} options={PLATFORM_OPTIONS} onSave={(v) => void patch(post, { platform: v })} />
          </Stop>
        );
      case 'idea':
        return (
          <Stop>
            <InlineText
              value={post.content_idea}
              onSave={(v) => { if (v.trim()) void patch(post, { content_idea: v.trim() }); else load(); }}
            />
          </Stop>
        );
      case 'status':
        return (
          <Stop>
            <InlineSelect value={post.status} options={STATUS_OPTIONS} onSave={(v) => changeStatus(post, v)} />
          </Stop>
        );
      case 'notes':
        return <ExpandableText value={post.notes} placeholder="—" onSave={(v) => void patch(post, { notes: v })} />;
      case 'actions':
        return (
          <button onClick={() => void handleDelete(post)} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-priority-p1">
            Delete
          </button>
        );
      default:
        return null;
    }
  }

  return (
    <div className="space-y-4">
      {gapOpen && !loading && (
        <div className="rounded-xl border border-sparrow-gold/40 bg-sparrow-gold/5 px-4 py-3 text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
          Nothing has gone up in the last two weeks and nothing is planned for the next two.
          {' '}{ownerName} has a reminder, and it shows on Home. Plan a post to clear it.
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl space-y-2 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
          <p>
            Aim to post at least every two weeks. If nothing has gone up in two weeks and nothing
            is planned for the next two, the reminder owner gets a task and it shows on Home.
            Add ideas any time, even without a date. When a post goes up, set its Status to Posted.
          </p>
          {setting && (
            <div className="flex items-center gap-2">
              <span>Reminders go to</span>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ownerColors[setting.owner_id] ?? 'bg-sparrow-gray dark:bg-sparrow-dark-border'}`} />
              <select
                value={setting.owner_id}
                onChange={(e) => void changeOwner(e.target.value)}
                className="field-input mt-0 w-auto py-1 text-sm"
              >
                {(ownerProfiles.some((p) => p.id === setting.owner_id)
                  ? ownerProfiles
                  : [...ownerProfiles, ...profiles.filter((p) => p.id === setting.owner_id)]
                ).map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <button
          onClick={() => { setShowAddForm((v) => !v); setFormError(null); }}
          className="btn-primary shrink-0 text-xs"
        >
          {showAddForm ? 'Cancel' : '+ Add post'}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAdd} className="max-w-3xl space-y-3 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="field-label field-label-required" htmlFor="pst-content-idea">Post idea</label>
              <textarea
                id="pst-content-idea"
                className={fieldClass('pst-content-idea', 'field-input w-full resize-none')}
                rows={2}
                value={form.content_idea}
                onChange={(e) => { setForm((f) => ({ ...f, content_idea: e.target.value })); clear('pst-content-idea'); }}
              />
              {fieldError('pst-content-idea') && <p className="mt-1 text-xs text-priority-p1">{fieldError('pst-content-idea')}</p>}
            </div>
            <div>
              <label className="field-label" htmlFor="pst-platform">Platform</label>
              <select
                id="pst-platform"
                className="field-input w-full"
                value={form.platform}
                onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value as SocialPlatform }))}
              >
                {PLATFORM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="pst-date">Date (optional)</label>
              <input
                id="pst-date"
                type="date"
                className="field-input w-full"
                value={form.planned_date}
                onChange={(e) => setForm((f) => ({ ...f, planned_date: e.target.value }))}
              />
            </div>
            <div className="col-span-2">
              <label className="field-label" htmlFor="pst-notes">Notes (optional)</label>
              <input
                id="pst-notes"
                className="field-input w-full"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          {formError && <p className="text-sm text-priority-p1">{formError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setShowAddForm(false); setFormError(null); }} className="btn-ghost text-sm">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary text-sm">
              {saving ? 'Saving…' : 'Add post'}
            </button>
          </div>
        </form>
      )}

      {saveError && <p className="text-sm text-priority-p1">{saveError}</p>}

      {loading && posts.length === 0 ? (
        <p className="py-8 text-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading…</p>
      ) : (
        <GridTableShell
          layout={layout}
          sortKey={sortKey}
          sortDir={sortDir}
          onHeaderClick={handleHeaderClick}
          startResize={startResize}
          items={rows}
          rowKey={(p) => p.id}
          renderCell={renderCell}
          rowClassName={(p) => (p.status === 'posted' ? 'opacity-60' : 'hover:bg-sparrow-mist/40 dark:hover:bg-sparrow-dark-surface2')}
          emptyMessage="No upcoming posts. Add one above."
          toolbar={
            <span className="mr-auto self-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
              {upcoming.length} upcoming post{upcoming.length !== 1 ? 's' : ''}
            </span>
          }
        />
      )}

      {past.length > 0 && (
        <button
          onClick={() => setShowPast((v) => !v)}
          className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink underline"
        >
          {showPast ? 'Hide past posts' : `Show past posts (${past.length})`}
        </button>
      )}
    </div>
  );
}
