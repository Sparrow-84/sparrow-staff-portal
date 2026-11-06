// Partnerships Room — Collateral tab: printed and digital pieces (business cards, brochures…)
// and when each is next due for review. Same table engine and look as the Directory.
// Each item has one Next review date (migration 0211). Two weeks before it, the item comes up
// on Home and in its owner's tasks; "Mark reviewed" asks when the next review is.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRequiredFields } from '@/hooks/useRequiredFields';
import { localDate } from '@/lib/date';
import { assignAvatarColors } from '@/lib/avatarColors';
import type { Profile } from '@/lib/types';
import {
  COLLATERAL_HEADS_UP_DAYS,
  collateralSchemaReady,
  createCollateralItem,
  defaultNextCollateralReview,
  fetchArchivedCollateral,
  fetchCollateral,
  setCollateralActive,
  syncCollateralReviewTasks,
  updateCollateralItem,
  type CollateralInput,
  type PartnershipCollateral,
} from '@/lib/partnerships-tabs';
import {
  useColumnLayout, useHeaderInteractions, GridTableShell,
  InlineText, InlineSelect, ExpandableText,
  type GridColumn,
} from '@/components/gridtable/GridTable';
import { CollateralReviewedButton } from './CollateralReviewedButton';

type ColKey = 'status' | 'item' | 'link' | 'qty' | 'owner' | 'last_reviewed' | 'next_review' | 'notes' | 'actions';

const COLUMNS: GridColumn<ColKey>[] = [
  { key: 'status', label: '', defaultWidth: 36 },
  { key: 'item', label: 'Item', defaultWidth: 240 },
  { key: 'link', label: 'Link', defaultWidth: 200 },
  { key: 'qty', label: 'Qty on hand', defaultWidth: 100 },
  { key: 'owner', label: 'Owner', defaultWidth: 170 },
  { key: 'last_reviewed', label: 'Last reviewed', defaultWidth: 150 },
  { key: 'next_review', label: 'Next review', defaultWidth: 170 },
  { key: 'notes', label: 'Notes', defaultWidth: 260 },
  { key: 'actions', label: '', defaultWidth: 90 },
];

const SORTABLE: ColKey[] = ['item', 'qty', 'owner', 'last_reviewed', 'next_review'];

const DAY_MS = 86_400_000;

function daysUntil(date: string, today: string): number {
  return Math.round((new Date(`${date}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / DAY_MS);
}

type ReviewStatus = 'on_schedule' | 'coming_up' | 'overdue';

/** Same dot meaning as the Directory: green = nothing to do, gold = coming up, red = overdue. */
const REVIEW_STATUS: Record<ReviewStatus, { label: string; dot: string; text: string }> = {
  on_schedule: { label: 'On schedule', dot: 'bg-sparrow-green', text: '' },
  coming_up: { label: 'Coming up — on Home and in the owner\'s tasks', dot: 'bg-sparrow-gold', text: 'text-sparrow-ink dark:text-sparrow-dark-ink' },
  overdue: { label: 'Overdue', dot: 'bg-priority-p1', text: 'font-medium text-priority-p1' },
};

function reviewStatus(item: PartnershipCollateral, today: string): ReviewStatus {
  const d = daysUntil(item.next_review_at, today);
  if (d < 0) return 'overdue';
  if (d <= COLLATERAL_HEADS_UP_DAYS) return 'coming_up';
  return 'on_schedule';
}

function dueNote(item: PartnershipCollateral, today: string): string | null {
  const d = daysUntil(item.next_review_at, today);
  if (d < 0) return `${Math.abs(d)} day${d === -1 ? '' : 's'} overdue`;
  if (d === 0) return 'Due today';
  if (d <= COLLATERAL_HEADS_UP_DAYS) return `Due in ${d} day${d === 1 ? '' : 's'}`;
  return null;
}

function emptyForm(): CollateralInput {
  return {
    item_name: '',
    qty_on_hand: '',
    notes: '',
    owner_id: '',
    link: '',
    last_reviewed_at: localDate(),
    next_review_at: defaultNextCollateralReview(),
  };
}

/** Clicks inside an editable cell shouldn't bubble to the row. */
function Stop({ children }: { children: ReactNode }) {
  return <div className="w-full" onClick={(e) => e.stopPropagation()}>{children}</div>;
}

export function PartnershipCollateralTab({ profiles }: { profiles: Profile[] }) {
  const [items, setItems] = useState<PartnershipCollateral[]>([]);
  const [archived, setArchived] = useState<PartnershipCollateral[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<CollateralInput>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { fieldClass, fieldError, clear, validate } = useRequiredFields([
    { key: 'pct-item-name', label: 'Item', valid: form.item_name.trim().length > 0 },
    { key: 'pct-owner', label: 'Owner', valid: !!form.owner_id },
    { key: 'pct-next-review', label: 'Next review', valid: !!form.next_review_at },
  ]);

  // Same standing-owner rule as the Directory: Partnerships staff + anyone granted room
  // access, never Exec.
  const ownerProfiles = profiles.filter(
    (p) => (p.department === 'partnerships' || p.partnerships_access) && p.department !== 'exec',
  );
  // Same palette + assignment as the Directory and Team page, so a person's color matches.
  const ownerColors = useMemo(() => assignAvatarColors(profiles), [profiles]);

  function ownerName(id: string) {
    return profiles.find((p) => p.id === id)?.full_name ?? 'Unassigned';
  }

  function load() {
    setLoading(true);
    Promise.all([
      fetchCollateral(),
      showArchived ? fetchArchivedCollateral() : Promise.resolve([]),
      collateralSchemaReady(),
    ])
      .then(([active, arch, ok]) => { setItems(active); setArchived(arch); setReady(ok); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [showArchived]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    syncCollateralReviewTasks().catch(console.error);
  }, []);

  async function patch(item: PartnershipCollateral, update: Partial<CollateralInput>) {
    setSaveError(null);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...update } : i)));
    try {
      await updateCollateralItem(item.id, update);
      // A moved date or new owner changes who gets a task and when — refresh the tasks now.
      if ('next_review_at' in update || 'owner_id' in update) await syncCollateralReviewTasks();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save that change.');
      load();
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setFormError(null);
    setSaving(true);
    try {
      await createCollateralItem({
        ...form,
        item_name: form.item_name.trim(),
        notes: form.notes?.trim() || null,
        qty_on_hand: form.qty_on_hand?.trim() || null,
        link: form.link?.trim() || null,
        last_reviewed_at: form.last_reviewed_at || localDate(),
      });
      await syncCollateralReviewTasks().catch(console.error);
      setForm(emptyForm());
      setShowAddForm(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add the item.');
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(item: PartnershipCollateral) {
    if (!confirm(`Archive "${item.item_name}"? It leaves the active list and its review reminders stop. You can restore it from "Show archived items".`)) return;
    await setCollateralActive(item.id, false).catch(console.error);
    load();
  }

  async function handleRestore(item: PartnershipCollateral) {
    await setCollateralActive(item.id, true).catch(console.error);
    await syncCollateralReviewTasks().catch(console.error);
    load();
  }

  const today = localDate();
  const overdueCount = items.filter((i) => reviewStatus(i, today) === 'overdue').length;
  const comingUpCount = items.filter((i) => reviewStatus(i, today) === 'coming_up').length;

  // ── Table layout + sort (same engine as the Directory) ──
  const layout = useColumnLayout(COLUMNS, 'sparrow-partnerships-collateral-table');
  const [sortKey, setSortKey] = useState<ColKey>('next_review');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const { startResize, handleHeaderClick: rawHeaderClick } = useHeaderInteractions(
    layout.colWidths, layout.setColWidths, sortKey, setSortKey, sortDir, setSortDir,
  );
  function handleHeaderClick(key: ColKey) {
    if (SORTABLE.includes(key)) rawHeaderClick(key);
  }

  const rows = useMemo(() => {
    const all = [...items, ...(showArchived ? archived : [])];
    const dir = sortDir === 'asc' ? 1 : -1;
    return all.sort((a, b) => {
      // Archived rows always sit at the bottom.
      if (a.active !== b.active) return a.active ? -1 : 1;
      let cmp = 0;
      switch (sortKey) {
        case 'item': cmp = a.item_name.localeCompare(b.item_name); break;
        case 'qty': cmp = (a.qty_on_hand ?? '').localeCompare(b.qty_on_hand ?? '', undefined, { numeric: true }); break;
        case 'owner': cmp = ownerName(a.owner_id).localeCompare(ownerName(b.owner_id)); break;
        case 'last_reviewed': cmp = a.last_reviewed_at.localeCompare(b.last_reviewed_at); break;
        default: cmp = a.next_review_at.localeCompare(b.next_review_at);
      }
      return cmp * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, archived, showArchived, sortKey, sortDir, profiles]);

  function renderCell(item: PartnershipCollateral, key: ColKey): ReactNode {
    const archivedRow = !item.active;
    const status = reviewStatus(item, today);
    const locked = archivedRow || !ready;
    switch (key) {
      case 'status':
        return archivedRow
          ? <span className="block h-2 w-2 rounded-full bg-sparrow-rule dark:bg-sparrow-dark-border" title="Archived" />
          : <span className={`block h-2 w-2 rounded-full ${REVIEW_STATUS[status].dot}`} title={REVIEW_STATUS[status].label} />;
      case 'item':
        return archivedRow
          ? <span className="truncate text-sm" title={item.item_name}>{item.item_name}</span>
          : (
            <Stop>
              <InlineText
                value={item.item_name}
                onSave={(v) => { if (v.trim()) void patch(item, { item_name: v.trim() }); else load(); }}
              />
            </Stop>
          );
      case 'link':
        return (
          <Stop>
            <div className="flex w-full items-center gap-1.5">
              {item.link && (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  title="Open"
                  className="shrink-0 rounded px-1 text-sm font-medium text-sparrow-green dark:text-sparrow-dark-green hover:bg-sparrow-mist/60 dark:hover:bg-sparrow-dark-surface2"
                >
                  ↗
                </a>
              )}
              {locked
                ? <span className="truncate text-sm text-sparrow-gray dark:text-sparrow-dark-gray">{item.link ?? '—'}</span>
                : <InlineText value={item.link ?? ''} placeholder="Paste a link" onSave={(v) => void patch(item, { link: v.trim() || null })} />}
            </div>
          </Stop>
        );
      case 'qty':
        return archivedRow
          ? <span className="text-sm">{item.qty_on_hand ?? '—'}</span>
          : <Stop><InlineText value={item.qty_on_hand ?? ''} placeholder="—" onSave={(v) => void patch(item, { qty_on_hand: v.trim() || null })} /></Stop>;
      case 'owner': {
        const options = ownerProfiles.some((p) => p.id === item.owner_id)
          ? ownerProfiles
          : [...ownerProfiles, ...profiles.filter((p) => p.id === item.owner_id)];
        return (
          <Stop>
            <div className="flex w-full items-center gap-1.5">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ownerColors[item.owner_id] ?? 'bg-sparrow-gray dark:bg-sparrow-dark-border'}`} />
              <InlineSelect
                value={item.owner_id}
                disabled={archivedRow}
                onSave={(v) => { if (v) void patch(item, { owner_id: v }); }}
                options={options.map((p) => ({ value: p.id, label: p.full_name }))}
              />
            </div>
          </Stop>
        );
      }
      case 'last_reviewed':
        return locked
          ? <span className="text-sm">{formatDate(item.last_reviewed_at)}</span>
          : <Stop><InlineText type="date" value={item.last_reviewed_at} onSave={(v) => { if (v) void patch(item, { last_reviewed_at: v }); }} /></Stop>;
      case 'next_review': {
        if (locked) return <span className="text-sm">{formatDate(item.next_review_at)}</span>;
        const note = dueNote(item, today);
        return (
          <Stop>
            <div className="flex w-full flex-col gap-0.5">
              <InlineText type="date" value={item.next_review_at} onSave={(v) => { if (v) void patch(item, { next_review_at: v }); }} />
              {note && <span className={`px-1 text-xs ${REVIEW_STATUS[status].text}`}>{note}</span>}
              <span className="px-1">
                <CollateralReviewedButton itemId={item.id} itemName={item.item_name} onDone={load} />
              </span>
            </div>
          </Stop>
        );
      }
      case 'notes':
        return archivedRow
          ? <span className="truncate text-sm text-sparrow-gray dark:text-sparrow-dark-gray" title={item.notes ?? ''}>{item.notes ?? '—'}</span>
          : <ExpandableText value={item.notes} placeholder="—" onSave={(v) => void patch(item, { notes: v })} />;
      case 'actions':
        return archivedRow ? (
          <button onClick={() => void handleRestore(item)} className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline">
            Restore
          </button>
        ) : (
          <button onClick={() => void handleArchive(item)} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-priority-p1">
            Archive
          </button>
        );
      default:
        return null;
    }
  }

  return (
    <div className="space-y-4">
      {!ready && (
        <div className="rounded-xl border border-sparrow-gold/40 bg-sparrow-gold/5 px-4 py-3 text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
          A database update for this tab is still waiting to run. Until it does, Link, Next review,
          Mark reviewed and adding items are switched off. The dates shown are still correct.
        </div>
      )}

      {(overdueCount > 0 || comingUpCount > 0) && (
        <div className="rounded-xl border border-priority-p1/30 bg-priority-p1/5 px-4 py-3 text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
          {overdueCount > 0 && <span>{overdueCount} item{overdueCount > 1 ? 's are' : ' is'} overdue for review. </span>}
          {comingUpCount > 0 && <span>{comingUpCount} {comingUpCount > 1 ? 'are' : 'is'} coming up in the next two weeks. </span>}
          Each owner has a task for it, and it shows on Home.
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
          Each item shows up on Home two weeks before its Next review. Check that everything on it
          is still accurate and there's enough on hand. Changes beyond a typo need the Partnerships
          Manager's approval before reprinting. Then click Mark reviewed. Need a look sooner? Set
          its Next review to today.
        </p>
        <button
          onClick={() => { setShowAddForm((v) => !v); setFormError(null); }}
          disabled={!ready}
          className="btn-primary shrink-0 text-xs disabled:opacity-50"
        >
          {showAddForm ? 'Cancel' : '+ Add item'}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAdd} className="max-w-3xl space-y-3 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="field-label field-label-required" htmlFor="pct-item-name">Item</label>
              <input
                id="pct-item-name"
                placeholder="e.g. General Brochure"
                className={fieldClass('pct-item-name', 'field-input w-full')}
                value={form.item_name}
                onChange={(e) => { setForm((f) => ({ ...f, item_name: e.target.value })); clear('pct-item-name'); }}
              />
              {fieldError('pct-item-name') && <p className="mt-1 text-xs text-priority-p1">{fieldError('pct-item-name')}</p>}
            </div>
            <div className="col-span-2">
              <label className="field-label" htmlFor="pct-link">Link to the file</label>
              <input
                id="pct-link"
                placeholder="The editable file, or its folder if there are several versions"
                className="field-input w-full"
                value={form.link ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
              />
            </div>
            <div>
              <label className="field-label field-label-required" htmlFor="pct-owner">Owner</label>
              <select
                id="pct-owner"
                className={fieldClass('pct-owner', 'field-input w-full')}
                value={form.owner_id}
                onChange={(e) => { setForm((f) => ({ ...f, owner_id: e.target.value })); clear('pct-owner'); }}
              >
                <option value="">Select an owner…</option>
                {ownerProfiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
              {fieldError('pct-owner') && <p className="mt-1 text-xs text-priority-p1">{fieldError('pct-owner')}</p>}
            </div>
            <div>
              <label className="field-label" htmlFor="pct-qty">Qty on hand</label>
              <input
                id="pct-qty"
                className="field-input w-full"
                value={form.qty_on_hand ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, qty_on_hand: e.target.value }))}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="pct-last-reviewed">Last reviewed</label>
              <input
                id="pct-last-reviewed"
                type="date"
                className="field-input w-full"
                value={form.last_reviewed_at}
                onChange={(e) => setForm((f) => ({ ...f, last_reviewed_at: e.target.value }))}
              />
            </div>
            <div>
              <label className="field-label field-label-required" htmlFor="pct-next-review">Next review</label>
              <input
                id="pct-next-review"
                type="date"
                className={fieldClass('pct-next-review', 'field-input w-full')}
                value={form.next_review_at}
                onChange={(e) => { setForm((f) => ({ ...f, next_review_at: e.target.value })); clear('pct-next-review'); }}
              />
              {fieldError('pct-next-review') && <p className="mt-1 text-xs text-priority-p1">{fieldError('pct-next-review')}</p>}
            </div>
            <div className="col-span-2">
              <label className="field-label" htmlFor="pct-notes">Notes</label>
              <input
                id="pct-notes"
                className="field-input w-full"
                value={form.notes ?? ''}
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
              {saving ? 'Saving…' : 'Add item'}
            </button>
          </div>
        </form>
      )}

      {saveError && <p className="text-sm text-priority-p1">{saveError}</p>}

      {loading && items.length === 0 ? (
        <p className="py-8 text-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading…</p>
      ) : (
        <GridTableShell
          layout={layout}
          sortKey={sortKey}
          sortDir={sortDir}
          onHeaderClick={handleHeaderClick}
          startResize={startResize}
          items={rows}
          rowKey={(i) => i.id}
          renderCell={renderCell}
          rowClassName={(i) => (i.active ? 'hover:bg-sparrow-mist/40 dark:hover:bg-sparrow-dark-surface2' : 'opacity-60')}
          emptyMessage="No collateral items yet. Add your first one above."
          toolbar={
            <span className="mr-auto self-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
              {items.length} active item{items.length !== 1 ? 's' : ''}
            </span>
          }
        />
      )}

      <button
        onClick={() => setShowArchived((v) => !v)}
        className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink underline"
      >
        {showArchived ? 'Hide archived items' : 'Show archived items'}
      </button>
    </div>
  );
}

function formatDate(d: string): string {
  return new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
