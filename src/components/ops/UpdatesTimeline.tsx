import { useState } from 'react';
import { dayToTimestamp, formatDate, timestampToDay } from '@/lib/grants-types';

export interface UpdateEntryLike {
  id: string;
  body: string;
  milestone: string | null;
  created_at: string;
}

/** A timeline, shared by Grant Prospects and Active Grants — the historical record of
 * what happened and when, kept separate from current-state fields (Findings/Decision
 * Reasoning/Action Steps) that get overwritten as understanding evolves. Entries tagged
 * with a `milestone` label (Applied/Awarded/Declined/etc.) get a gold marker so key
 * events stand out from routine notes even as the log grows — never buried by scrolling.
 * The date shown is the day it HAPPENED (created_at is backdated for milestones logged
 * after the fact), and both the text and the date can be corrected with Edit. */
export function UpdatesTimeline({
  entries,
  onAdd,
  onEdit,
  busy,
}: {
  entries: UpdateEntryLike[];
  onAdd: (body: string) => Promise<void>;
  onEdit: (id: string, patch: { body?: string; created_at?: string }) => Promise<void>;
  busy: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editDay, setEditDay] = useState('');

  async function add() {
    const body = draft.trim();
    if (!body || saving) return;
    setSaving(true);
    try {
      await onAdd(body);
      setDraft('');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(e: UpdateEntryLike) {
    setEditingId(e.id);
    setEditBody(e.body);
    setEditDay(timestampToDay(e.created_at));
  }

  async function saveEdit(e: UpdateEntryLike) {
    const body = editBody.trim();
    if (!body || saving) return;
    const patch: { body?: string; created_at?: string } = {};
    if (body !== e.body) patch.body = body;
    // Only touch the timestamp when the day actually changed, so an untouched entry keeps
    // its original time (and its place among same-day entries).
    if (editDay && editDay !== timestampToDay(e.created_at)) patch.created_at = dayToTimestamp(editDay);
    setSaving(true);
    try {
      if (patch.body !== undefined || patch.created_at !== undefined) await onEdit(e.id, patch);
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray">
        Updates — full history
      </p>
      <div className="space-y-3 rounded-xl border border-sparrow-rule/70 p-3">
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Add a note — a call, context, a question worth keeping…"
            className="field-input mt-0 text-xs"
          />
          <div className="flex justify-end">
            <button onClick={add} disabled={busy || saving || !draft.trim()} className="btn-primary text-xs">
              Add update
            </button>
          </div>
        </div>

        {entries.length === 0 && <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">No updates yet.</p>}

        <div>
          {entries.map((e, i) => (
            <div
              key={e.id}
              className={`relative pl-4 pb-3 last:pb-0 ${
                i === entries.length - 1 ? '' : 'border-l-2 border-sparrow-rule dark:border-sparrow-dark-border'
              }`}
            >
              <div
                className={`absolute left-[-5px] top-0.5 h-2.5 w-2.5 rounded-full border-2 ${
                  e.milestone
                    ? 'border-sparrow-gold bg-sparrow-gold'
                    : 'border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface'
                }`}
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-sparrow-gray dark:text-sparrow-dark-gray">{formatDate(e.created_at)}</span>
                {e.milestone && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-sparrow-cream dark:bg-sparrow-gold/15 px-1.5 py-0.5 text-[10px] font-bold text-sparrow-gold">
                    📌 {e.milestone}
                  </span>
                )}
                {editingId !== e.id && (
                  <button
                    onClick={() => startEdit(e)}
                    className="ml-auto text-[11px] font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline"
                  >
                    Edit
                  </button>
                )}
              </div>
              {editingId === e.id ? (
                <div className="mt-1 space-y-2">
                  <label className="block">
                    <span className="text-[11px] font-medium text-sparrow-gray dark:text-sparrow-dark-gray">Date it happened</span>
                    <input type="date" value={editDay} onChange={(ev) => setEditDay(ev.target.value)} className="field-input mt-0.5 text-xs" />
                  </label>
                  <textarea
                    value={editBody}
                    onChange={(ev) => setEditBody(ev.target.value)}
                    rows={3}
                    className="field-input mt-0 text-xs"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
                    >
                      Cancel
                    </button>
                    <button onClick={() => void saveEdit(e)} disabled={saving || !editBody.trim()} className="btn-primary text-xs">
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-0.5 whitespace-pre-wrap text-xs text-sparrow-ink dark:text-sparrow-dark-ink">{e.body}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
