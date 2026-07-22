import { useState, useEffect, useCallback } from 'react';
import { Drawer } from '@/components/lcp/Drawer';
import {
  fetchSubmission, approveSubmission, addComment,
  updateAddition, deleteAddition, updateRemoval, deleteRemoval,
} from '@/lib/inventory';
import {
  EXIT_METHOD_LABELS,
  monthName, displayAdditionCost,
  type InvMonthlySubmission, type InvAddition, type InvRemoval,
} from '@/lib/inventory-types';
import { useRequiredFields } from '@/hooks/useRequiredFields';

// ── Inline edit for an addition ───────────────────────────────────────────

function AdditionEditRow({
  entry,
  onSaved,
  onDelete,
}: {
  entry: InvAddition;
  onSaved: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(entry.description);
  const [cost, setCost] = useState(String(entry.cost));
  const [costSource, setCostSource] = useState(entry.cost_source);
  const [busy, setBusy] = useState(false);

  const { missingMessage, validate, fieldClass, clear, reset: resetValidation } = useRequiredFields([
    { key: `add-edit-desc-${entry.id}`, label: 'Description', valid: desc.trim().length > 0 },
  ]);

  async function save() {
    if (!validate()) return;
    setBusy(true);
    try {
      await updateAddition(entry.id, {
        description: desc.trim(),
        cost: parseFloat(cost) || entry.cost,
        cost_source: costSource,
      });
      setEditing(false);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm('Remove this entry?')) return;
    await deleteAddition(entry.id);
    onDelete();
  }

  if (!editing) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-sparrow-green/20 bg-sparrow-green/5 px-3 py-2.5">
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="text-sm font-medium truncate">{entry.description}</p>
          <div className="flex flex-wrap gap-x-3 text-xs text-sparrow-gray">
            <span>{displayAdditionCost(entry)}</span>
            {entry.cost_source === 'estimated' && <span className="text-sparrow-gold">est.</span>}
            {entry.ops_edited && <span className="text-sparrow-gold">edited by ops</span>}
            <span className="capitalize">{entry.condition}</span>
            {entry.is_donated && <span>Donated</span>}
            {entry.sub_location && <span>{entry.sub_location.name}</span>}
            {entry.is_batch && <span className="italic">{entry.batch_category}</span>}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => { resetValidation(); setEditing(true); }} className="text-xs text-sparrow-gray hover:text-sparrow-green transition px-1">
            Edit
          </button>
          <button onClick={remove} className="text-xs text-sparrow-gray hover:text-priority-p1 transition px-1">
            ✕
          </button>
        </div>
      </div>
    );
  }

  const descId = `add-edit-desc-${entry.id}`;
  return (
    <div className="rounded-lg border border-sparrow-gold/30 bg-sparrow-gold/5 p-3 space-y-2">
      <p className="text-xs font-medium text-sparrow-gold uppercase tracking-wide">Editing</p>
      <div>
        <label className="field-label" htmlFor={descId}>Description</label>
        <input
          id={descId}
          value={desc}
          onChange={(e) => { setDesc(e.target.value); clear(descId); }}
          className={fieldClass(descId)}
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="field-label">Cost $</label>
          <input type="number" value={cost} onChange={(e) => setCost(e.target.value)} className="field-input" />
        </div>
        <div className="flex-1">
          <label className="field-label">Source</label>
          <select value={costSource} onChange={(e) => setCostSource(e.target.value as 'known' | 'estimated')} className="field-input">
            <option value="known">Known</option>
            <option value="estimated">Estimated</option>
          </select>
        </div>
      </div>
      {missingMessage && <p className="text-xs text-priority-p1">{missingMessage}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={() => setEditing(false)} className="btn-ghost text-xs">Cancel</button>
        <button onClick={save} disabled={busy} className="btn-primary text-xs disabled:opacity-40">
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ── Inline edit for a removal ─────────────────────────────────────────────

function RemovalEditRow({
  entry,
  onSaved,
  onDelete,
}: {
  entry: InvRemoval;
  onSaved: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(entry.description);
  const [howItLeft, setHowItLeft] = useState(entry.how_it_left);
  const [busy, setBusy] = useState(false);

  const { missingMessage, validate, fieldClass, clear, reset: resetValidation } = useRequiredFields([
    { key: `rm-edit-desc-${entry.id}`, label: 'Description', valid: desc.trim().length > 0 },
  ]);

  async function save() {
    if (!validate()) return;
    setBusy(true);
    try {
      await updateRemoval(entry.id, { description: desc.trim(), how_it_left: howItLeft });
      setEditing(false);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm('Remove this entry?')) return;
    await deleteRemoval(entry.id);
    onDelete();
  }

  if (!editing) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-priority-p1/20 bg-priority-p1/5 px-3 py-2.5">
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="text-sm font-medium truncate">{entry.description}</p>
          <div className="flex flex-wrap gap-x-3 text-xs text-sparrow-gray">
            {entry.quantity_removed > 1 && <span>Qty: {entry.quantity_removed}</span>}
            <span>{EXIT_METHOD_LABELS[entry.how_it_left]}</span>
            {entry.ops_edited && <span className="text-sparrow-gold">edited by ops</span>}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => { resetValidation(); setEditing(true); }} className="text-xs text-sparrow-gray hover:text-sparrow-green transition px-1">
            Edit
          </button>
          <button onClick={remove} className="text-xs text-sparrow-gray hover:text-priority-p1 transition px-1">
            ✕
          </button>
        </div>
      </div>
    );
  }

  const descId = `rm-edit-desc-${entry.id}`;
  return (
    <div className="rounded-lg border border-sparrow-gold/30 bg-sparrow-gold/5 p-3 space-y-2">
      <p className="text-xs font-medium text-sparrow-gold uppercase tracking-wide">Editing</p>
      <div>
        <label className="field-label" htmlFor={descId}>Description</label>
        <input
          id={descId}
          value={desc}
          onChange={(e) => { setDesc(e.target.value); clear(descId); }}
          className={fieldClass(descId)}
        />
      </div>
      <div>
        <label className="field-label">How it left</label>
        <select value={howItLeft} onChange={(e) => setHowItLeft(e.target.value as InvRemoval['how_it_left'])} className="field-input">
          {(Object.entries(EXIT_METHOD_LABELS) as [InvRemoval['how_it_left'], string][]).map(
            ([k, v]) => <option key={k} value={k}>{v}</option>,
          )}
        </select>
      </div>
      {missingMessage && <p className="text-xs text-priority-p1">{missingMessage}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={() => setEditing(false)} className="btn-ghost text-xs">Cancel</button>
        <button onClick={save} disabled={busy} className="btn-primary text-xs disabled:opacity-40">
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────

export function SubmissionReviewPanel({
  submissionId,
  open,
  onClose,
  onApproved,
}: {
  submissionId: string | null;
  open: boolean;
  onClose: () => void;
  onApproved: () => void;
}) {
  const [sub, setSub] = useState<InvMonthlySubmission | null>(null);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [comment, setComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [err, setErr] = useState('');

  const reload = useCallback(async () => {
    if (!submissionId) return;
    setLoading(true);
    try {
      const s = await fetchSubmission(submissionId);
      setSub(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load.');
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    if (open && submissionId) void reload();
    else setSub(null);
  }, [open, submissionId, reload]);

  async function handleApprove() {
    if (!sub) return;
    setApproving(true);
    setErr('');
    try {
      await approveSubmission(sub.id);
      onApproved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not approve.');
    } finally {
      setApproving(false);
    }
  }

  async function handlePostComment() {
    if (!sub || !comment.trim()) return;
    setPostingComment(true);
    try {
      await addComment(sub.id, comment.trim());
      setComment('');
      await reload();
    } finally {
      setPostingComment(false);
    }
  }

  const title = sub
    ? `${sub.location?.name ?? ''} — ${monthName(sub.period_month)} ${sub.period_year}`
    : 'Loading…';

  const subtitle = sub
    ? `Submitted by ${sub.submitter?.full_name ?? 'unknown'}`
    : undefined;

  const additions = sub?.additions ?? [];
  const removals  = sub?.removals  ?? [];
  const comments  = sub?.comments  ?? [];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={
        sub?.status === 'submitted' ? (
          <div className="space-y-2">
            {err && <p className="text-xs text-priority-p1">{err}</p>}
            <button
              onClick={handleApprove}
              disabled={approving}
              className="btn-primary w-full disabled:opacity-40"
            >
              {approving ? 'Approving…' : 'Approve & commit to register'}
            </button>
            <p className="text-xs text-center text-sparrow-gray">
              This updates the asset register. Cannot be undone.
            </p>
          </div>
        ) : sub?.status === 'approved' ? (
          <p className="text-xs text-center text-sparrow-green">
            ✓ Approved — changes committed to register
          </p>
        ) : null
      }
    >
      {loading && (
        <p className="text-sm text-sparrow-gray text-center py-8">Loading…</p>
      )}

      {sub && !loading && (
        <div className="space-y-5">
          {/* Section A */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
              Section A — Arrivals
            </h3>
            {sub.nothing_came_in && additions.length === 0 && (
              <p className="text-sm text-sparrow-gray italic">Nothing came in this month.</p>
            )}
            {additions.map((a) =>
              sub.status === 'submitted' ? (
                <AdditionEditRow key={a.id} entry={a} onSaved={reload} onDelete={reload} />
              ) : (
                <div key={a.id} className="rounded-lg border border-sparrow-green/20 bg-sparrow-green/5 px-3 py-2.5">
                  <p className="text-sm font-medium">{a.description}</p>
                  <div className="flex flex-wrap gap-x-3 text-xs text-sparrow-gray mt-0.5">
                    <span>{displayAdditionCost(a)}</span>
                    {a.cost_source === 'estimated' && <span className="text-sparrow-gold">est.</span>}
                    <span className="capitalize">{a.condition}</span>
                    {a.is_donated && <span>Donated</span>}
                    {a.sub_location && <span>{a.sub_location.name}</span>}
                  </div>
                </div>
              )
            )}
          </section>

          {/* Section B */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
              Section B — Removals
            </h3>
            {sub.nothing_left && removals.length === 0 && (
              <p className="text-sm text-sparrow-gray italic">Nothing left this month.</p>
            )}
            {removals.map((r) =>
              sub.status === 'submitted' ? (
                <RemovalEditRow key={r.id} entry={r} onSaved={reload} onDelete={reload} />
              ) : (
                <div key={r.id} className="rounded-lg border border-priority-p1/20 bg-priority-p1/5 px-3 py-2.5">
                  <p className="text-sm font-medium">{r.description}</p>
                  <div className="flex flex-wrap gap-x-3 text-xs text-sparrow-gray mt-0.5">
                    {r.quantity_removed > 1 && <span>Qty: {r.quantity_removed}</span>}
                    <span>{EXIT_METHOD_LABELS[r.how_it_left]}</span>
                  </div>
                </div>
              )
            )}
          </section>

          {/* Comments */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
              Notes to submitter
            </h3>
            {comments.length === 0 && (
              <p className="text-xs text-sparrow-gray italic">No notes yet.</p>
            )}
            {comments.map((c) => (
              <div key={c.id} className="rounded-lg bg-sparrow-mist px-3 py-2.5 space-y-0.5">
                <p className="text-xs font-medium text-sparrow-ink">{c.author?.full_name ?? 'Unknown'}</p>
                <p className="text-sm text-sparrow-ink">{c.body}</p>
                <p className="text-xs text-sparrow-gray">
                  {new Date(c.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a note for the submitter…"
                className="field-input flex-1 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && !postingComment && handlePostComment()}
              />
              <button
                onClick={handlePostComment}
                disabled={!comment.trim() || postingComment}
                className="btn-primary text-sm disabled:opacity-40 shrink-0"
              >
                Send
              </button>
            </div>
          </section>
        </div>
      )}
    </Drawer>
  );
}
