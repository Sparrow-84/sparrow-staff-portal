import { useEffect, useState } from 'react';
import {
  ATTENDANCE_LABEL,
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
}

export function SessionLogViewer({ log, families, currentUserId, onBack, onChanged }: Props) {
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
        <button onClick={onBack} className="mt-0.5 text-sm text-sparrow-gray hover:text-sparrow-ink">
          ← Back
        </button>
        <div>
          <h2 className="font-serif text-xl font-semibold text-sparrow-ink">
            {SESSION_LOG_LABEL[log.session_type]}
          </h2>
          <p className="mt-0.5 text-sm text-sparrow-gray">
            {formatDate(log.session_date)}
            {log.created_by_name && ` · Filed by ${log.created_by_name}`}
          </p>
        </div>
      </div>

      {/* Attendance */}
      {log.attendance.length > 0 && (
        <section className="rounded-2xl border border-sparrow-rule bg-white p-4 shadow-card">
          <span className="field-label">Attendance</span>
          <ul className="mt-3 space-y-2">
            {log.attendance.map((a) => {
              const family = familyMap.get(a.family_id);
              return (
                <li key={a.family_id} className="flex items-center gap-3 text-sm">
                  <span className="flex-1 font-medium text-sparrow-ink">
                    {family?.display_name ?? 'Unknown family'}
                  </span>
                  <span
                    className={`rounded-lg px-2 py-1 text-[11px] font-medium ${
                      a.status === 'no_show'
                        ? 'bg-priority-p1/10 text-priority-p1'
                        : a.status === 'late'
                          ? 'bg-priority-p2/10 text-priority-p2'
                          : 'bg-sparrow-green/10 text-sparrow-green'
                    }`}
                  >
                    {ATTENDANCE_LABEL[a.status]}
                  </span>
                  {a.voucher_awarded && (
                    <span className="text-xs text-sparrow-gray">Voucher</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Group note (Thursday) */}
      {log.session_type === 'thursday_group' && (
        <section className="rounded-2xl border border-sparrow-rule bg-white p-4 shadow-card">
          <div className="flex items-center justify-between">
            <label className="field-label">Group session note</label>
            {groupNoteSaved && <span className="text-xs text-sparrow-green">Saved</span>}
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
      <section className="rounded-2xl border border-sparrow-rule bg-white p-4 shadow-card">
        <div className="flex items-center justify-between">
          <span className="field-label">
            {log.session_type === 'thursday_group' ? 'Individual session notes' : 'Session notes'}
          </span>
          {noteSaved && <span className="text-xs text-sparrow-green">Saved</span>}
        </div>
        {notes.length === 0 ? (
          <p className="mt-2 text-sm text-sparrow-gray">No notes were filed for this session.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {notes.map((n) => {
              const family = familyMap.get(n.family_id);
              return (
                <li key={n.id} className="rounded-xl border border-sparrow-rule/70 p-3">
                  {family && (
                    <p className="mb-1.5 text-xs font-semibold text-sparrow-gray">{family.display_name}</p>
                  )}
                  {editingNoteId === n.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editNoteBody}
                        onChange={(e) => setEditNoteBody(e.target.value)}
                        rows={3}
                        className="field-input"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveNote(n.id)}
                          disabled={savingNote || !editNoteBody.trim()}
                          className="btn-primary text-xs"
                        >
                          {savingNote ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingNoteId(null)}
                          disabled={savingNote}
                          className="btn-ghost text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-sparrow-ink">{n.body}</p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <p className="text-xs text-sparrow-gray">
                          {n.author_name && `${n.author_name} · `}
                          {n.updated_at && n.updated_at !== n.created_at
                            ? `Edited ${dayLabel(n.updated_at)}`
                            : dayLabel(n.created_at)}
                        </p>
                        <div className="flex items-center gap-2">
                          {n.author_id === currentUserId && (
                            <button
                              onClick={() => { setEditingNoteId(n.id); setEditNoteBody(n.body); }}
                              className="text-xs text-sparrow-gray hover:text-sparrow-green"
                            >
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
        )}
      </section>
    </div>
  );
}
