import { useEffect, useState } from 'react';
import {
  AREA_LABEL,
  ATTENDANCE_LABEL,
  GOAL_AREAS,
  GOAL_AREA_LABEL,
  HOMEWORK_AREAS,
  MONDAY_BUCKETS,
  MONDAY_BUCKET_DESCRIPTION,
  MONDAY_BUCKET_LABEL,
  SESSION_LOG_LABEL,
  type AttendanceStatus,
  type Family,
  type Goal,
  type GoalArea,
  type Homework,
  type HomeworkArea,
  type MondayBucket,
  type SessionAttendance,
  type StaffNoteWithSession,
} from '@/lib/lcp-types';
import { dueLabel, isOverdue, dayLabel } from '@/lib/lcp-format';
import {
  assignHomework,
  awardVoucher,
  createGoal,
  fetchAttendanceForSessionLog,
  fetchGoalsForFamily,
  fetchHomeworkForFamily,
  fetchNotesForSessionLog,
  fetchStaffNotesWithSession,
  findOrCreateMondaySessionLog,
  markGoalMet,
  setHomeworkStatus,
  upsertBucketNote,
  upsertSessionAttendance,
} from '@/lib/lcp';

const STATUSES: AttendanceStatus[] = ['on_time', 'late', 'no_show'];

const BUCKET_CARD_BORDER: Record<MondayBucket, string> = {
  finance: 'border-t-4 border-t-[#2F6B4F]',
  life_skills: 'border-t-4 border-t-[#B8790A]',
  mentoring: 'border-t-4 border-t-[#7A5980]',
};

const BUCKET_FAMILY_CARD_BG: Record<MondayBucket, string> = {
  finance: 'bg-[#2F6B4F]/10',
  life_skills: 'bg-[#B8790A]/10',
  mentoring: 'bg-[#7A5980]/[0.12]',
};

interface AssignDraft {
  title: string;
  area: HomeworkArea;
  due_date: string;
}

interface GoalDraft {
  title: string;
  area: GoalArea;
  due_date: string;
}

interface Props {
  families: Family[];
  currentUserId: string;
  sessionDate: string;
  eventId: string | null;
  onBack: () => void;
  onOpenFamily: (familyId: string) => void;
  onChanged: () => void;
}

function formatDateHeader(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export function MondaySessionPanel({
  families,
  currentUserId,
  sessionDate,
  eventId,
  onBack,
  onOpenFamily,
  onChanged,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [sessionLogId, setSessionLogId] = useState<string | null>(null);
  const [selectedBucket, setSelectedBucketRaw] = useState<MondayBucket | null>(null);
  function setSelectedBucket(bucket: MondayBucket | null) {
    setSelectedBucketRaw(bucket);
    setBucketSaveState('idle');
    setBucketSaveError(null);
  }

  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [vouchers, setVouchers] = useState<Record<string, boolean>>({});

  const [notesByBucket, setNotesByBucket] = useState<Record<MondayBucket, Record<string, string>>>({
    finance: {},
    life_skills: {},
    mentoring: {},
  });
  // Last-saved copy, so the Save button only writes families whose note
  // actually changed -- notesByBucket itself is the live editable draft.
  const [savedNotesByBucket, setSavedNotesByBucket] = useState<Record<MondayBucket, Record<string, string>>>({
    finance: {},
    life_skills: {},
    mentoring: {},
  });
  const [bucketSaveState, setBucketSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [bucketSaveError, setBucketSaveError] = useState<string | null>(null);

  const [liveGoals, setLiveGoals] = useState<Record<string, Goal[]>>({});
  const [liveHomework, setLiveHomework] = useState<Record<string, Homework[]>>({});
  const [addGoalOpen, setAddGoalOpen] = useState<Record<string, boolean>>({});
  const [goalDraft, setGoalDraft] = useState<Record<string, GoalDraft>>({});
  const [assignOpen, setAssignOpen] = useState<Record<string, boolean>>({});
  const [assignDraft, setAssignDraft] = useState<Record<string, AssignDraft>>({});

  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({});
  const [historyByFamily, setHistoryByFamily] = useState<Record<string, StaffNoteWithSession[] | 'loading'>>({});

  // Bootstrap: find-or-create tonight's shared log, then load whatever's already there.
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      setLoading(true);
      const logId = await findOrCreateMondaySessionLog(sessionDate, eventId, currentUserId);
      if (cancelled) return;
      setSessionLogId(logId);
      onChanged();

      const [attRows, notes] = await Promise.all([
        fetchAttendanceForSessionLog(logId),
        fetchNotesForSessionLog(logId),
      ]);
      if (cancelled) return;

      const attMap: Record<string, AttendanceStatus> = {};
      const voucherMap: Record<string, boolean> = {};
      for (const f of families) attMap[f.id] = 'on_time';
      for (const row of attRows as SessionAttendance[]) {
        attMap[row.family_id] = row.status;
        voucherMap[row.family_id] = row.voucher_awarded;
      }
      setAttendance(attMap);
      setVouchers(voucherMap);

      const grouped: Record<MondayBucket, Record<string, string>> = { finance: {}, life_skills: {}, mentoring: {} };
      for (const n of notes) {
        if (n.bucket) grouped[n.bucket][n.family_id] = n.body;
      }
      setNotesByBucket(grouped);
      setSavedNotesByBucket(structuredClone(grouped));

      const goalUpdates: Record<string, Goal[]> = {};
      const hwUpdates: Record<string, Homework[]> = {};
      await Promise.all(
        families.map(async (f) => {
          const [goals, hw] = await Promise.all([fetchGoalsForFamily(f.id), fetchHomeworkForFamily(f.id)]);
          goalUpdates[f.id] = goals.filter((g) => g.status !== 'met');
          hwUpdates[f.id] = hw.filter((h) => h.status !== 'complete');
        }),
      );
      if (cancelled) return;
      setLiveGoals(goalUpdates);
      setLiveHomework(hwUpdates);
      setLoading(false);
    }
    void boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionDate]);

  async function setStatus(familyId: string, status: AttendanceStatus) {
    setAttendance((prev) => ({ ...prev, [familyId]: status }));
    if (!sessionLogId) return;
    await upsertSessionAttendance(sessionLogId, familyId, status, vouchers[familyId] ?? false, currentUserId);
  }

  function markAllPresent() {
    for (const f of families) void setStatus(f.id, 'on_time');
  }

  async function awardFamilyVoucher(familyId: string) {
    if (vouchers[familyId] || !sessionLogId) return;
    setVouchers((prev) => ({ ...prev, [familyId]: true }));
    await upsertSessionAttendance(sessionLogId, familyId, attendance[familyId] ?? 'on_time', true, currentUserId);
    await awardVoucher(familyId, 'Session attendance — Monday Mentoring', currentUserId);
  }

  function setNoteDraft(bucket: MondayBucket, familyId: string, body: string) {
    setNotesByBucket((prev) => ({ ...prev, [bucket]: { ...prev[bucket], [familyId]: body } }));
    if (bucketSaveState !== 'idle') setBucketSaveState('idle');
  }

  // Explicit save, not tied to a field losing focus -- doesn't depend on
  // attendance being filled in, doesn't depend on which family/bucket was
  // touched last, and surfaces a real error instead of failing silently.
  async function saveBucketNotes(bucket: MondayBucket) {
    if (!sessionLogId) return;
    setBucketSaveState('saving');
    setBucketSaveError(null);
    try {
      const drafts = notesByBucket[bucket];
      const saved = savedNotesByBucket[bucket];
      const changed = families.filter((f) => (drafts[f.id] ?? '').trim() !== (saved[f.id] ?? '').trim());
      await Promise.all(
        changed.map((f) => upsertBucketNote(sessionLogId, f.id, bucket, (drafts[f.id] ?? '').trim(), currentUserId)),
      );
      setSavedNotesByBucket((prev) => ({ ...prev, [bucket]: { ...drafts } }));
      setBucketSaveState('saved');
    } catch (e) {
      setBucketSaveState('error');
      setBucketSaveError(e instanceof Error ? e.message : 'Could not save notes — try again.');
    }
  }

  async function toggleHistory(familyId: string) {
    setHistoryOpen((prev) => ({ ...prev, [familyId]: !prev[familyId] }));
    if (!historyByFamily[familyId]) {
      setHistoryByFamily((prev) => ({ ...prev, [familyId]: 'loading' }));
      const notes = await fetchStaffNotesWithSession(familyId, 3);
      setHistoryByFamily((prev) => ({ ...prev, [familyId]: notes }));
    }
  }

  async function toggleGoalMet(familyId: string, goalId: string) {
    setLiveGoals((prev) => ({ ...prev, [familyId]: (prev[familyId] ?? []).filter((g) => g.id !== goalId) }));
    await markGoalMet(goalId);
  }

  async function submitGoal(familyId: string) {
    const draft = goalDraft[familyId];
    if (!draft?.title.trim()) return;
    await createGoal({ family_id: familyId, area: draft.area, title: draft.title.trim(), due_date: draft.due_date || null }, currentUserId);
    const goals = await fetchGoalsForFamily(familyId);
    setLiveGoals((prev) => ({ ...prev, [familyId]: goals.filter((g) => g.status !== 'met') }));
    setGoalDraft((prev) => ({ ...prev, [familyId]: { title: '', area: 'relational', due_date: '' } }));
    setAddGoalOpen((prev) => ({ ...prev, [familyId]: false }));
  }

  async function toggleHomeworkComplete(familyId: string, hwId: string) {
    setLiveHomework((prev) => ({ ...prev, [familyId]: (prev[familyId] ?? []).filter((h) => h.id !== hwId) }));
    await setHomeworkStatus(hwId, 'complete');
  }

  async function submitHomework(familyId: string) {
    const draft = assignDraft[familyId];
    if (!draft?.title.trim()) return;
    await assignHomework(
      { family_id: familyId, session_id: null, area: draft.area, title: draft.title.trim(), description: null, due_date: draft.due_date || null },
      currentUserId,
    );
    const hw = await fetchHomeworkForFamily(familyId);
    setLiveHomework((prev) => ({ ...prev, [familyId]: hw.filter((h) => h.status !== 'complete') }));
    setAssignDraft((prev) => ({ ...prev, [familyId]: { title: '', area: 'general', due_date: '' } }));
    setAssignOpen((prev) => ({ ...prev, [familyId]: false }));
  }

  if (loading) return <p className="py-8 text-sm text-sparrow-gray">Loading tonight's session…</p>;

  // "Logged" means actually saved, not just typed -- reads the last-saved
  // snapshot, not the live draft, so this badge can't overstate progress
  // that hasn't been written yet.
  function bucketCompletion(bucket: MondayBucket) {
    const done = families.filter((f) => (savedNotesByBucket[bucket][f.id] ?? '').trim().length > 0).length;
    return { done, total: families.length };
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          onClick={onBack}
          className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-sparrow-sage px-3 py-1.5 text-sm font-semibold text-sparrow-green transition hover:bg-sparrow-sage/70"
        >
          ← Back
        </button>
        <div>
          <h2 className="font-serif text-xl font-semibold text-sparrow-ink">{SESSION_LOG_LABEL.monday_mentoring}</h2>
          <p className="mt-0.5 text-sm text-sparrow-gray">
            {formatDateHeader(sessionDate)} · Shared log — any LCP staff can add to it tonight
          </p>
        </div>
      </div>

      {/* Attendance */}
      <section className="rounded-2xl border border-sparrow-rule bg-white p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <span className="field-label">Attendance</span>
          <button onClick={markAllPresent} className="text-xs font-medium text-sparrow-green">
            Mark all on time
          </button>
        </div>
        <ul className="space-y-2">
          {families.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-sparrow-rule/70 p-2">
              <span className="w-36 shrink-0 truncate text-sm font-medium text-sparrow-ink">{f.display_name}</span>
              <div className="flex gap-1">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(f.id, s)}
                    className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${
                      attendance[f.id] === s
                        ? s === 'no_show'
                          ? 'bg-priority-p1 text-white'
                          : s === 'late'
                            ? 'bg-priority-p2 text-white'
                            : 'bg-sparrow-green text-white'
                        : 'bg-sparrow-mist text-sparrow-gray hover:text-sparrow-ink'
                    }`}
                  >
                    {ATTENDANCE_LABEL[s]}
                  </button>
                ))}
              </div>
              <label className="ml-auto flex items-center gap-1.5 text-xs text-sparrow-gray">
                <input
                  type="checkbox"
                  checked={vouchers[f.id] ?? false}
                  disabled={vouchers[f.id]}
                  onChange={() => awardFamilyVoucher(f.id)}
                  className="h-3.5 w-3.5 rounded border-sparrow-rule text-sparrow-green focus:ring-sparrow-green"
                />
                Voucher
              </label>
            </li>
          ))}
        </ul>
      </section>

      {/* Bucket picker / active bucket */}
      <section className="mt-9">
        {selectedBucket === null ? (
          <>
            <span className="field-label">Choose a bucket</span>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              {MONDAY_BUCKETS.map((bucket) => {
                const { done, total } = bucketCompletion(bucket);
                return (
                  <button
                    key={bucket}
                    onClick={() => setSelectedBucket(bucket)}
                    className={`flex flex-col items-start gap-2 rounded-2xl border border-sparrow-rule bg-sparrow-mist p-4 text-left shadow-card transition hover:border-sparrow-green/40 ${BUCKET_CARD_BORDER[bucket]}`}
                  >
                    <h3 className="font-serif text-base font-semibold text-sparrow-ink">{MONDAY_BUCKET_LABEL[bucket]}</h3>
                    <p className="text-xs text-sparrow-gray">{MONDAY_BUCKET_DESCRIPTION[bucket]}</p>
                    <span
                      className={`rounded-full border px-2 py-1 text-[11px] font-bold ${
                        done === total && total > 0
                          ? 'border-sparrow-green bg-sparrow-green text-white'
                          : 'border-sparrow-rule bg-white text-sparrow-gray'
                      }`}
                    >
                      {done} of {total} logged
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSelectedBucket(null)}
                className="inline-flex items-center gap-1 rounded-full bg-sparrow-sage px-3 py-1.5 text-sm font-semibold text-sparrow-green transition hover:bg-sparrow-sage/70"
              >
                ← All buckets
              </button>
              <div className="inline-flex gap-0.5 rounded-xl border border-sparrow-rule bg-sparrow-mist p-1">
                {MONDAY_BUCKETS.map((bucket) => {
                  const { done, total } = bucketCompletion(bucket);
                  const active = bucket === selectedBucket;
                  return (
                    <button
                      key={bucket}
                      onClick={() => setSelectedBucket(bucket)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        active ? 'bg-white text-sparrow-green shadow-sm' : 'text-sparrow-gray hover:text-sparrow-ink'
                      }`}
                    >
                      {MONDAY_BUCKET_LABEL[bucket]}
                      <span
                        className={`rounded-full px-1.5 text-[10px] ${
                          active ? 'bg-sparrow-sage text-sparrow-green' : 'bg-white text-sparrow-gray'
                        }`}
                      >
                        {done}/{total}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              {families.map((f) => (
                <MondayFamilyCard
                  key={f.id}
                  family={f}
                  bucket={selectedBucket}
                  note={notesByBucket[selectedBucket][f.id] ?? ''}
                  onNoteChange={(body) => setNoteDraft(selectedBucket, f.id, body)}
                  historyOpen={historyOpen[f.id] ?? false}
                  historyData={historyByFamily[f.id]}
                  onToggleHistory={() => toggleHistory(f.id)}
                  onOpenFamily={() => onOpenFamily(f.id)}
                  goals={liveGoals[f.id] ?? []}
                  onToggleGoalMet={(goalId) => toggleGoalMet(f.id, goalId)}
                  addGoalOpen={addGoalOpen[f.id] ?? false}
                  onToggleAddGoal={() => setAddGoalOpen((prev) => ({ ...prev, [f.id]: !prev[f.id] }))}
                  goalDraft={goalDraft[f.id] ?? { title: '', area: 'relational', due_date: '' }}
                  onGoalDraftChange={(d) => setGoalDraft((prev) => ({ ...prev, [f.id]: d }))}
                  onSubmitGoal={() => submitGoal(f.id)}
                  homework={liveHomework[f.id] ?? []}
                  onToggleHomeworkComplete={(hwId) => toggleHomeworkComplete(f.id, hwId)}
                  assignOpen={assignOpen[f.id] ?? false}
                  onToggleAssign={() => setAssignOpen((prev) => ({ ...prev, [f.id]: !prev[f.id] }))}
                  assignDraft={assignDraft[f.id] ?? { title: '', area: 'general', due_date: '' }}
                  onAssignDraftChange={(d) => setAssignDraft((prev) => ({ ...prev, [f.id]: d }))}
                  onSubmitHomework={() => submitHomework(f.id)}
                />
              ))}
            </div>

            <div className="mt-4 flex items-center gap-3 border-t border-sparrow-rule pt-4">
              <button
                onClick={() => void saveBucketNotes(selectedBucket)}
                disabled={bucketSaveState === 'saving'}
                className="btn-primary"
              >
                {bucketSaveState === 'saving' ? 'Saving…' : `Save ${MONDAY_BUCKET_LABEL[selectedBucket]} notes`}
              </button>
              {bucketSaveState === 'saved' && <span className="text-sm font-medium text-sparrow-green">Saved ✓</span>}
              {bucketSaveState === 'error' && (
                <span className="text-sm font-medium text-priority-p1">{bucketSaveError}</span>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

// ── Per-family card within a bucket ─────────────────────────────────────

interface MondayFamilyCardProps {
  family: Family;
  bucket: MondayBucket;
  note: string;
  onNoteChange: (body: string) => void;
  historyOpen: boolean;
  historyData: StaffNoteWithSession[] | 'loading' | undefined;
  onToggleHistory: () => void;
  onOpenFamily: () => void;
  goals: Goal[];
  onToggleGoalMet: (goalId: string) => void;
  addGoalOpen: boolean;
  onToggleAddGoal: () => void;
  goalDraft: GoalDraft;
  onGoalDraftChange: (d: GoalDraft) => void;
  onSubmitGoal: () => void;
  homework: Homework[];
  onToggleHomeworkComplete: (hwId: string) => void;
  assignOpen: boolean;
  onToggleAssign: () => void;
  assignDraft: AssignDraft;
  onAssignDraftChange: (d: AssignDraft) => void;
  onSubmitHomework: () => void;
}

function MondayFamilyCard({
  family,
  bucket,
  note,
  onNoteChange,
  historyOpen,
  historyData,
  onToggleHistory,
  onOpenFamily,
  goals,
  onToggleGoalMet,
  addGoalOpen,
  onToggleAddGoal,
  goalDraft,
  onGoalDraftChange,
  onSubmitGoal,
  homework,
  onToggleHomeworkComplete,
  assignOpen,
  onToggleAssign,
  assignDraft,
  onAssignDraftChange,
  onSubmitHomework,
}: MondayFamilyCardProps) {
  return (
    <div className={`rounded-2xl border border-transparent p-4 ${BUCKET_FAMILY_CARD_BG[bucket]}`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <button onClick={onOpenFamily} className="font-medium text-sparrow-ink hover:text-sparrow-green hover:underline">
          {family.display_name}
        </button>
        <button onClick={onToggleHistory} className="text-xs font-semibold text-sparrow-gray hover:text-sparrow-green">
          History {historyOpen ? '▴' : '▾'}
        </button>
      </div>

      {historyOpen && (
        <div className="mb-3 rounded-xl bg-white p-3">
          {historyData === 'loading' || historyData === undefined ? (
            <p className="text-xs text-sparrow-gray">Loading…</p>
          ) : historyData.length === 0 ? (
            <p className="text-xs text-sparrow-gray">No prior notes yet.</p>
          ) : (
            <ul className="space-y-2">
              {historyData.map((n) => (
                <li key={n.id} className="border-t border-sparrow-rule/70 pt-2 first:border-t-0 first:pt-0">
                  <p className="text-xs text-sparrow-gray">
                    {n.session_log_type ? SESSION_LOG_LABEL[n.session_log_type] : 'Note'} · {dayLabel(n.created_at)}
                  </p>
                  <p className="text-sm text-sparrow-ink">{n.body}</p>
                </li>
              ))}
            </ul>
          )}
          <button onClick={onOpenFamily} className="mt-2 text-xs font-semibold text-sparrow-green">
            See full history →
          </button>
        </div>
      )}

      <textarea
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        rows={2}
        placeholder={`${family.display_name}'s ${bucket === 'finance' ? 'finance' : bucket === 'life_skills' ? 'life skills' : 'mentoring'} note…`}
        className="field-input bg-white"
      />

      {/* Goals — shared across all 3 buckets, not duplicated */}
      <div className="mt-3 border-t border-white/60 pt-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="field-label">Goals</span>
          <button onClick={onToggleAddGoal} className="text-xs font-medium text-sparrow-green">
            {addGoalOpen ? 'Cancel' : '+ Add goal'}
          </button>
        </div>
        {goals.length === 0 && !addGoalOpen && <p className="text-xs text-sparrow-gray">None yet.</p>}
        {goals.length > 0 && (
          <ul className="space-y-1.5">
            {goals.map((goal) => (
              <li key={goal.id} className="flex items-center gap-2 text-sm text-sparrow-ink">
                <input
                  type="checkbox"
                  onChange={() => onToggleGoalMet(goal.id)}
                  className="h-4 w-4 rounded border-sparrow-rule text-sparrow-green focus:ring-sparrow-green"
                />
                <span>
                  {GOAL_AREA_LABEL[goal.area]}: {goal.title}
                </span>
                {goal.due_date && (
                  <span className={`ml-auto shrink-0 text-xs ${isOverdue(goal.due_date) ? 'font-medium text-priority-p1' : 'text-sparrow-gray'}`}>
                    {dueLabel(goal.due_date)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {addGoalOpen && (
          <div className="mt-2 space-y-2 rounded-xl bg-white p-3">
            <input
              type="text"
              value={goalDraft.title}
              onChange={(e) => onGoalDraftChange({ ...goalDraft, title: e.target.value })}
              placeholder="What is she working toward?"
              className="field-input"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={goalDraft.area}
                onChange={(e) => onGoalDraftChange({ ...goalDraft, area: e.target.value as GoalArea })}
                className="field-input"
              >
                {GOAL_AREAS.map((a) => (
                  <option key={a} value={a}>{GOAL_AREA_LABEL[a]}</option>
                ))}
              </select>
              <input
                type="date"
                value={goalDraft.due_date}
                onChange={(e) => onGoalDraftChange({ ...goalDraft, due_date: e.target.value })}
                className="field-input"
              />
            </div>
            <button onClick={onSubmitGoal} disabled={!goalDraft.title.trim()} className="btn-primary text-xs">
              Add goal
            </button>
          </div>
        )}
      </div>

      {/* Homework — shared across all 3 buckets, not duplicated */}
      <div className="mt-3 border-t border-white/60 pt-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="field-label">Homework</span>
          <button onClick={onToggleAssign} className="text-xs font-medium text-sparrow-green">
            {assignOpen ? 'Cancel' : '+ Assign'}
          </button>
        </div>
        {homework.length === 0 && !assignOpen && <p className="text-xs text-sparrow-gray">None yet.</p>}
        {homework.length > 0 && (
          <ul className="space-y-1.5">
            {homework.map((hw) => (
              <li key={hw.id} className="flex items-center gap-2 text-sm text-sparrow-ink">
                <input
                  type="checkbox"
                  onChange={() => onToggleHomeworkComplete(hw.id)}
                  className="h-4 w-4 rounded border-sparrow-rule text-sparrow-green focus:ring-sparrow-green"
                />
                <span>
                  {AREA_LABEL[hw.area]}: {hw.title}
                </span>
                {hw.due_date && (
                  <span className={`ml-auto shrink-0 text-xs ${isOverdue(hw.due_date) ? 'font-medium text-priority-p1' : 'text-sparrow-gray'}`}>
                    {dueLabel(hw.due_date)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {assignOpen && (
          <div className="mt-2 space-y-2 rounded-xl bg-white p-3">
            <input
              type="text"
              value={assignDraft.title}
              onChange={(e) => onAssignDraftChange({ ...assignDraft, title: e.target.value })}
              placeholder="Homework title"
              className="field-input"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={assignDraft.area}
                onChange={(e) => onAssignDraftChange({ ...assignDraft, area: e.target.value as HomeworkArea })}
                className="field-input"
              >
                {HOMEWORK_AREAS.map((a) => (
                  <option key={a} value={a}>{AREA_LABEL[a]}</option>
                ))}
              </select>
              <input
                type="date"
                value={assignDraft.due_date}
                onChange={(e) => onAssignDraftChange({ ...assignDraft, due_date: e.target.value })}
                className="field-input"
              />
            </div>
            <button onClick={onSubmitHomework} disabled={!assignDraft.title.trim()} className="btn-primary text-xs">
              Assign
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
