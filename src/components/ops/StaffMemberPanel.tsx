import { useCallback, useEffect, useState } from 'react';
import { localDate } from '@/lib/date';
import type { Profile } from '@/lib/types';
import {
  DOC_TYPES,
  daysSince,
  docTypeLabel,
  type Checklist,
  type ChecklistKind,
  type ChecklistStep,
  type DocType,
  type Issue,
  type Review,
  type StaffDocument,
  type StaffNote,
  type Touchpoint,
} from '@/lib/ops-types';
import {
  addDocument,
  addIssue,
  addNote,
  addReview,
  addTouchpoint,
  completeChecklist,
  completeReview,
  deleteDocument,
  deleteNote,
  fetchChecklistSteps,
  fetchChecklistsForStaff,
  fetchDocuments,
  fetchIssues,
  fetchNotes,
  fetchReviews,
  fetchTouchpoints,
  setIssueStatus,
  setStepDone,
  startChecklist,
} from '@/lib/ops';
import { dayLabel } from '@/lib/lcp-format';
import { Drawer } from '@/components/lcp/Drawer';

type Tab = 'notes' | 'docs' | 'issues' | 'touchpoints' | 'reviews' | 'checklist';
const TABS: { key: Tab; label: string }[] = [
  { key: 'notes', label: 'Notes' },
  { key: 'docs', label: 'Docs' },
  { key: 'issues', label: 'Issues' },
  { key: 'touchpoints', label: '1:1s' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'checklist', label: 'Checklist' },
];

export function StaffMemberPanel({
  open,
  staff,
  currentUserId,
  onClose,
  onChanged,
}: {
  open: boolean;
  staff: Profile | null;
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>('notes');
  const [notes, setNotes] = useState<StaffNote[]>([]);
  const [docs, setDocs] = useState<StaffDocument[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [touchpoints, setTouchpoints] = useState<Touchpoint[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);

  const staffId = staff?.id;

  const reload = useCallback(async () => {
    if (!staffId) return;
    const [n, d, i, t, r, c] = await Promise.all([
      fetchNotes(staffId),
      fetchDocuments(staffId),
      fetchIssues(staffId),
      fetchTouchpoints(staffId),
      fetchReviews(staffId),
      fetchChecklistsForStaff(staffId),
    ]);
    setNotes(n);
    setDocs(d);
    setIssues(i);
    setTouchpoints(t);
    setReviews(r);
    setChecklists(c);
  }, [staffId]);

  useEffect(() => {
    if (open && staffId) {
      setTab('notes');
      void reload();
    }
  }, [open, staffId, reload]);

  if (!staff) return null;
  const changed = () => {
    void reload();
    onChanged();
  };

  return (
    <Drawer open={open} onClose={onClose} title={staff.full_name} subtitle={`${staff.role} · ${staff.department}`}>
      <p className="mb-3 rounded-lg bg-sparrow-cream px-3 py-2 text-xs text-sparrow-ink">
        🔒 Operations only ({staff.full_name} can’t see anything here, except their own onboarding checklist).
      </p>
      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-sparrow-rule bg-sparrow-mist p-1 text-xs">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-2.5 py-1.5 font-medium transition ${
              tab === t.key ? 'bg-white text-sparrow-green shadow-sm' : 'text-sparrow-gray hover:text-sparrow-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'notes' && <NotesTab staffId={staff.id} notes={notes} currentUserId={currentUserId} onChanged={changed} />}
      {tab === 'docs' && <DocsTab staffId={staff.id} docs={docs} currentUserId={currentUserId} onChanged={changed} />}
      {tab === 'issues' && <IssuesTab staffId={staff.id} issues={issues} currentUserId={currentUserId} onChanged={changed} />}
      {tab === 'touchpoints' && (
        <TouchpointsTab staffId={staff.id} items={touchpoints} currentUserId={currentUserId} onChanged={changed} />
      )}
      {tab === 'reviews' && <ReviewsTab staffId={staff.id} reviews={reviews} currentUserId={currentUserId} onChanged={changed} />}
      {tab === 'checklist' && (
        <ChecklistTab staffId={staff.id} checklists={checklists} currentUserId={currentUserId} onChanged={changed} />
      )}
    </Drawer>
  );
}

// ── Notes ────────────────────────────────────────────────────────────
function NotesTab({
  staffId,
  notes,
  currentUserId,
  onChanged,
}: {
  staffId: string;
  notes: StaffNote[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  async function add() {
    if (!body.trim()) return;
    setBusy(true);
    await addNote(staffId, body.trim(), currentUserId);
    setBody('');
    setBusy(false);
    onChanged();
  }
  return (
    <div className="space-y-3">
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Management note…" className="field-input" />
      <button onClick={add} disabled={busy || !body.trim()} className="btn-primary">
        Add note
      </button>
      <ul className="space-y-2">
        {notes.length === 0 && <li className="text-sm text-sparrow-gray">No notes yet.</li>}
        {notes.map((n) => (
          <li key={n.id} className="rounded-xl border border-sparrow-rule/70 p-3">
            <p className="text-sm text-sparrow-ink">{n.body}</p>
            <div className="mt-1 flex items-center justify-between text-xs text-sparrow-gray">
              <span>{dayLabel(n.created_at)}</span>
              <button onClick={() => deleteNote(n.id).then(onChanged)} className="hover:text-priority-p1">
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Documents ────────────────────────────────────────────────────────
function DocsTab({
  staffId,
  docs,
  currentUserId,
  onChanged,
}: {
  staffId: string;
  docs: StaffDocument[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [type, setType] = useState<DocType>('other');
  const [busy, setBusy] = useState(false);
  async function add() {
    if (!label.trim()) return;
    setBusy(true);
    await addDocument({ staff_id: staffId, label: label.trim(), url: url.trim() || null, doc_type: type }, currentUserId);
    setLabel('');
    setUrl('');
    setType('other');
    setBusy(false);
    onChanged();
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-sparrow-gray">Link documents (the files themselves live in Google Drive).</p>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. 2026 review)" className="field-input" />
      <div className="flex gap-2">
        <select value={type} onChange={(e) => setType(e.target.value as DocType)} className="field-input mt-0 flex-1">
          {DOC_TYPES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Drive link" className="field-input mt-0 flex-1" />
        <button onClick={add} disabled={busy || !label.trim()} className="btn-primary shrink-0">
          Add
        </button>
      </div>
      <ul className="divide-y divide-sparrow-rule/70 rounded-xl border border-sparrow-rule">
        {docs.length === 0 && <li className="p-3 text-sm text-sparrow-gray">No documents.</li>}
        {docs.map((d) => (
          <li key={d.id} className="flex items-center gap-2 p-3 text-sm">
            <span className="flex-1">
              {d.url ? (
                <a href={d.url} target="_blank" rel="noreferrer" className="font-medium text-sparrow-green underline">
                  {d.label}
                </a>
              ) : (
                <span className="font-medium text-sparrow-ink">{d.label}</span>
              )}
              <span className="ml-2 text-xs text-sparrow-gray">{docTypeLabel(d.doc_type)}</span>
            </span>
            <button onClick={() => deleteDocument(d.id).then(onChanged)} className="text-xs text-sparrow-gray hover:text-priority-p1">
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Issues ───────────────────────────────────────────────────────────
function IssuesTab({
  staffId,
  issues,
  currentUserId,
  onChanged,
}: {
  staffId: string;
  issues: Issue[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  async function add() {
    if (!body.trim()) return;
    setBusy(true);
    await addIssue(staffId, body.trim(), currentUserId);
    setBody('');
    setBusy(false);
    onChanged();
  }
  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-priority-p1/10 px-3 py-2 text-xs text-priority-p1">
        Sensitive HR log — Andrew, Susanna, and Shelly only.
      </p>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Document a concern…" className="field-input" />
      <button onClick={add} disabled={busy || !body.trim()} className="btn-primary">
        Log issue
      </button>
      <ul className="space-y-2">
        {issues.length === 0 && <li className="text-sm text-sparrow-gray">No issues logged.</li>}
        {issues.map((i) => (
          <li key={i.id} className={`rounded-xl border p-3 ${i.status === 'open' ? 'border-priority-p1/40' : 'border-sparrow-rule/70'}`}>
            <p className="text-sm text-sparrow-ink">{i.body}</p>
            <div className="mt-1 flex items-center justify-between text-xs text-sparrow-gray">
              <span>
                {dayLabel(i.created_at)} ·{' '}
                <span className={i.status === 'open' ? 'font-medium text-priority-p1' : ''}>{i.status}</span>
              </span>
              <button
                onClick={() => setIssueStatus(i.id, i.status === 'open' ? 'resolved' : 'open').then(onChanged)}
                className="hover:text-sparrow-green"
              >
                {i.status === 'open' ? 'Mark resolved' : 'Reopen'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Touchpoints ──────────────────────────────────────────────────────
function TouchpointsTab({
  staffId,
  items,
  currentUserId,
  onChanged,
}: {
  staffId: string;
  items: Touchpoint[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [on, setOn] = useState(() => localDate());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const last = items[0] ? daysSince(items[0].met_on) : null;
  async function add() {
    setBusy(true);
    await addTouchpoint(staffId, currentUserId, on, note.trim() || null);
    setNote('');
    setBusy(false);
    onChanged();
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-sparrow-gray">{last === null ? 'No 1:1 logged yet.' : `Last met ${last} days ago.`}</p>
      <div className="flex gap-2">
        <input type="date" value={on} onChange={(e) => setOn(e.target.value)} className="field-input mt-0" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="field-input mt-0 flex-1" />
        <button onClick={add} disabled={busy} className="btn-primary shrink-0">
          Log 1:1
        </button>
      </div>
      <ul className="space-y-2">
        {items.map((t) => (
          <li key={t.id} className="rounded-xl border border-sparrow-rule/70 p-3 text-sm">
            <span className="font-medium text-sparrow-ink">{dayLabel(t.met_on)}</span>
            {t.note && <p className="text-sparrow-gray">{t.note}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Reviews ──────────────────────────────────────────────────────────
function ReviewsTab({
  staffId,
  reviews,
  currentUserId,
  onChanged,
}: {
  staffId: string;
  reviews: Review[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  async function schedule() {
    if (!due) return;
    setBusy(true);
    await addReview(staffId, due, currentUserId);
    setDue('');
    setBusy(false);
    onChanged();
  }
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="field-input mt-0 flex-1" />
        <button onClick={schedule} disabled={busy || !due} className="btn-primary shrink-0">
          Schedule review
        </button>
      </div>
      <ul className="space-y-2">
        {reviews.length === 0 && <li className="text-sm text-sparrow-gray">No reviews scheduled.</li>}
        {reviews.map((r) => {
          const overdue = r.status === 'scheduled' && daysSince(r.due_date)! > 0;
          return (
            <li key={r.id} className="flex items-center justify-between rounded-xl border border-sparrow-rule/70 p-3 text-sm">
              <span>
                Due {dayLabel(r.due_date)}
                {r.status === 'completed' ? (
                  <span className="ml-2 text-xs text-sparrow-green">completed</span>
                ) : overdue ? (
                  <span className="ml-2 text-xs font-medium text-priority-p1">overdue</span>
                ) : null}
              </span>
              {r.status === 'scheduled' && (
                <button onClick={() => completeReview(r.id, null).then(onChanged)} className="text-xs font-medium text-sparrow-green">
                  Mark done
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Checklist (onboarding / offboarding) ─────────────────────────────
function ChecklistTab({
  staffId,
  checklists,
  currentUserId,
  onChanged,
}: {
  staffId: string;
  checklists: Checklist[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const active = checklists.find((c) => c.status === 'active') ?? null;
  const [steps, setSteps] = useState<ChecklistStep[]>([]);
  const [busy, setBusy] = useState(false);

  const loadSteps = useCallback(async () => {
    if (active) setSteps(await fetchChecklistSteps(active.id));
    else setSteps([]);
  }, [active]);

  useEffect(() => {
    void loadSteps();
  }, [loadSteps]);

  async function start(kind: ChecklistKind) {
    setBusy(true);
    await startChecklist(staffId, kind, currentUserId);
    setBusy(false);
    onChanged();
  }
  async function toggle(step: ChecklistStep) {
    await setStepDone(step.id, !step.done, currentUserId);
    await loadSteps();
  }
  async function finish() {
    if (!active) return;
    setBusy(true);
    await completeChecklist(active.id);
    setBusy(false);
    onChanged();
  }

  if (!active) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-sparrow-gray">No active checklist.</p>
        <div className="flex gap-2">
          <button onClick={() => start('onboarding')} disabled={busy} className="btn-primary flex-1">
            Start onboarding
          </button>
          <button onClick={() => start('offboarding')} disabled={busy} className="btn-ghost flex-1 border border-sparrow-rule">
            Start offboarding
          </button>
        </div>
        {checklists.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-sparrow-gray">
            {checklists.map((c) => (
              <li key={c.id} className="capitalize">
                {c.kind} · {c.status}
                {c.completed_at ? ` · ${dayLabel(c.completed_at)}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const done = steps.filter((s) => s.done).length;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-serif text-base font-semibold capitalize text-sparrow-green">{active.kind}</span>
        <span className="text-xs text-sparrow-gray">
          {done}/{steps.length}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-sparrow-sage">
        <div
          className="h-full rounded-full bg-sparrow-green transition-all"
          style={{ width: `${steps.length ? Math.round((done / steps.length) * 100) : 0}%` }}
        />
      </div>
      <ul className="space-y-2">
        {steps.map((s) => (
          <li
            key={s.id}
            className={`flex items-start gap-2 rounded-xl border p-2.5 ${s.parent_step_id ? 'ml-5 border-sparrow-rule/50 bg-sparrow-mist' : 'border-sparrow-rule/70'}`}
          >
            <button
              onClick={() => toggle(s)}
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 text-white transition-colors ${
                s.done ? 'border-sparrow-green bg-sparrow-green' : 'border-sparrow-rule'
              }`}
              aria-label="Toggle step"
            >
              {s.done && '✓'}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className={`text-sm ${s.done ? 'text-sparrow-gray line-through' : 'text-sparrow-ink'}`}>{s.title}</p>
                {s.estimated_minutes && (
                  <span className="rounded-full bg-sparrow-rule/60 px-1.5 py-0.5 text-[10px] text-sparrow-gray">
                    ~{s.estimated_minutes} min
                  </span>
                )}
              </div>
              {s.description && <p className="text-xs text-sparrow-gray">{s.description}</p>}
              {s.url && (
                <a href={s.url} target="_blank" rel="noreferrer" className="text-xs text-sparrow-green hover:underline">
                  Open link ↗
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
      <button onClick={finish} disabled={busy || done < steps.length} className="btn-primary w-full">
        {done < steps.length ? `${steps.length - done} steps left` : `Complete ${active.kind}`}
      </button>
    </div>
  );
}
