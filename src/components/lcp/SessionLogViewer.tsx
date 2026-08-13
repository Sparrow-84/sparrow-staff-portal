import { useEffect, useState } from 'react';
import {
  ATTENDANCE_LABEL,
  MONDAY_BUCKETS,
  MONDAY_BUCKET_LABEL,
  SESSION_LOG_LABEL,
  type Family,
  type SessionLog,
  type StaffNote,
} from '@/lib/lcp-types';
import { fetchNotesForSessionLog, updateSessionLog, updateStaffNote } from '@/lib/lcp';
import { dayLabel } from '@/lib/lcp-format';

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

interface Props {
  log: SessionLog;
  families: Family[];
  currentUserId: string;
  onBack: () => void;
  onChanged: () => void;
  onOpenFamily: (familyId: string) => void;
}

export function SessionLogViewer({ log, families, currentUserId, onBack, onChanged, onOpenFamily }: Props) {
  const [notes, setNotes] = useState<StaffNote[]>([]);
  const [groupNote, setGroupNote] = useState(log.group_note ?? '');
  const [savingGroup, setSavingGroup] = useState(false);
  const [groupNoteSaved, setGroupNoteSaved] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteBody, setEditNoteBody] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  async function loadNotes() {
    const ns = await fetchNotesForSessionLog(log.id);
    setNotes(ns);
  }

  useEffect(() => { void loadNotes(); }, [log.id]);

  async function saveGroupNote() {
    setSavingGroup(true);
    await updateSessionLog(log.id, groupNote.trim() || null);
    setSavingGroup(false);
    setGroupNoteSaved(true);
    setTimeout(() => setGroupNoteSaved(false), 2500);
    onChanged();
  }

  async function saveNote(id: string) {
    setSavingNote(true);
    await updateStaffNote(id, editNoteBody.trim());
    setEditingNoteId(null);
    await loadNotes();
    setSavingNote(false);
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2500);
  }

  const familyMap = new Map(families.map((f) => [f.id, f]));
  const groupNoteChanged = groupNote.trim() !== (log.group_note ?? '');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          onClick={onBack}
          className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-sparrow-sage dark:bg-sparrow-green/15 px-3 py-1.5 text-sm font-semibold text-sparrow-green dark:text-sparrow-dark-green transition hover:bg-sparrow-sage/70 dark:hover:bg-sparrow-green/25"
        >
          ← Back
        </button>
        <div>
          <h2 className="font-serif text-xl font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">
            {SESSION_LOG_LABEL[log.session_type]}
          </h2>
          <p className="mt-0.5 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
            {formatDate(log.session_date)}
            {log.created_by_name && ` · Filed by ${log.created_by_name}`}
          </p>
        </div>
      </div>

      {/* Attendance */}
      {log.attendance.length > 0 && (
        <section className="rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4 shadow-card">
          <span className="field-label">Attendance</span>
          <ul className="mt-3 space-y-2">
            {log.attendance.map((a) => {
              const family = familyMap.get(a.family_id);
              return (
                <li key={a.family_id} className="flex items-center gap-3 text-sm">
                  {family ? (
                    <button
                      onClick={() => onOpenFamily(family.id)}
                      className="flex-1 text-left font-medium text-sparrow-ink dark:text-sparrow-dark-ink hover:text-sparrow-green dark:hover:text-sparrow-dark-green hover:underline"
                    >
                      {family.display_name}
                    </button>
                  ) : (
                    <span className="flex-1 font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Unknown family</span>
                  )}
                  <span
                    className={`rounded-lg px-2 py-1 text-[11px] font-medium ${
                      a.status === 'no_show'
                        ? 'bg-priority-p1/10 text-priority-p1'
                        : a.status === 'late'
                          ? 'bg-priority-p2/10 text-priority-p2'
                          : 'bg-sparrow-green/10 text-sparrow-green dark:text-sparrow-dark-green'
                    }`}
                  >
                    {ATTENDANCE_LABEL[a.status]}
                  </span>
                  {a.voucher_awarded && (
                    <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Voucher</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Group note (Thursday) */}
      {log.session_type === 'thursday_group' && (
        <section className="rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4 shadow-card">
          <div className="flex items-center justify-between">
            <label className="field-label">Group session note</label>
            {groupNoteSaved && <span className="text-xs text-sparrow-green dark:text-sparrow-dark-green">Saved</span>}
          </div>
          <textarea
            value={groupNote}
            onChange={(e) => setGroupNote(e.target.value)}
            rows={4}
            className="field-input mt-2"
          />
          <button
            onClick={saveGroupNote}
            disabled={savingGroup || !groupNoteChanged}
            className="btn-primary mt-2"
          >
            {savingGroup ? 'Saving…' : 'Save note'}
          </button>
        </section>
      )}

      {/* Per-family notes */}
      {log.session_type === 'monday_mentoring' ? (
        <div className="space-y-4">
          {MONDAY_BUCKETS.map((bucket) => (
            <section key={bucket} className="rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4 shadow-card">
              <div className="flex items-center justify-between">
                <span className="field-label">{MONDAY_BUCKET_LABEL[bucket]}</span>
                {noteSaved && <span className="text-xs text-sparrow-green dark:text-sparrow-dark-green">Saved</span>}
              </div>
              <NoteList
                notes={notes.filter((n) => n.bucket === bucket)}
                familyMap={familyMap}
                currentUserId={currentUserId}
                editingNoteId={editingNoteId}
                editNoteBody={editNoteBody}
                savingNote={savingNote}
                onEditStart={(n) => { setEditingNoteId(n.id); setEditNoteBody(n.body); }}
                onEditCancel={() => setEditingNoteId(null)}
                onEditBodyChange={setEditNoteBody}
                onSave={saveNote}
                onOpenFamily={onOpenFamily}
                emptyMessage="No note logged for this bucket."
              />
            </section>
          ))}
        </div>
      ) : (
        <section className="rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4 shadow-card">
          <div className="flex items-center justify-between">
            <span className="field-label">
              {log.session_type === 'thursday_group' ? 'Individual session notes' : 'Session notes'}
            </span>
            {noteSaved && <span className="text-xs text-sparrow-green dark:text-sparrow-dark-green">Saved</span>}
          </div>
          <NoteList
            notes={notes}
            familyMap={familyMap}
            currentUserId={currentUserId}
            editingNoteId={editingNoteId}
            editNoteBody={editNoteBody}
            savingNote={savingNote}
            onEditStart={(n) => { setEditingNoteId(n.id); setEditNoteBody(n.body); }}
            onEditCancel={() => setEditingNoteId(null)}
            onEditBodyChange={setEditNoteBody}
            onSave={saveNote}
            onOpenFamily={onOpenFamily}
            emptyMessage="No notes were filed for this session."
          />
        </section>
      )}
    </div>
  );
}

function NoteList({
  notes,
  familyMap,
  currentUserId,
  editingNoteId,
  editNoteBody,
  savingNote,
  onEditStart,
  onEditCancel,
  onEditBodyChange,
  onSave,
  onOpenFamily,
  emptyMessage,
}: {
  notes: StaffNote[];
  familyMap: Map<string, Family>;
  currentUserId: string;
  editingNoteId: string | null;
  editNoteBody: string;
  savingNote: boolean;
  onEditStart: (n: StaffNote) => void;
  onEditCancel: () => void;
  onEditBodyChange: (body: string) => void;
  onSave: (id: string) => void;
  onOpenFamily: (familyId: string) => void;
  emptyMessage: string;
}) {
  if (notes.length === 0) {
    return <p className="mt-2 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">{emptyMessage}</p>;
  }
  return (
    <ul className="mt-3 space-y-3">
      {notes.map((n) => {
        const family = familyMap.get(n.family_id);
        // Bucket notes are a shared record any staff can edit; non-bucket notes
        // (Thursday/ad-hoc) stay author-only, as before.
        const canEdit = n.bucket !== null || n.author_id === currentUserId;
        return (
          <li key={n.id} className="rounded-xl border border-sparrow-rule/70 p-3">
            {family && (
              <button
                onClick={() => onOpenFamily(family.id)}
                className="mb-1.5 text-xs font-semibold text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-green dark:hover:text-sparrow-dark-green hover:underline"
                title={`See all of ${family.display_name}'s notes`}
              >
                {family.display_name}
              </button>
            )}
            {editingNoteId === n.id ? (
              <div className="space-y-2">
                <textarea
                  value={editNoteBody}
                  onChange={(e) => onEditBodyChange(e.target.value)}
                  rows={3}
                  className="field-input"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => onSave(n.id)}
                    disabled={savingNote || !editNoteBody.trim()}
                    className="btn-primary text-xs"
                  >
                    {savingNote ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={onEditCancel} disabled={savingNote} className="btn-ghost text-xs">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">{n.body}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                    {n.author_name && `${n.author_name} · `}
                    {n.updated_at && n.updated_at !== n.created_at
                      ? `Edited ${dayLabel(n.updated_at)}`
                      : dayLabel(n.created_at)}
                  </p>
                  <div className="flex items-center gap-2">
                    {canEdit && (
                      <button onClick={() => onEditStart(n)} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-green dark:hover:text-sparrow-dark-green">
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
