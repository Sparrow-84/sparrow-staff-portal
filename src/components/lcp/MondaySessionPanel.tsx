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
  fetchBucketStatus,
  fetchGoalsForFamily,
  fetchHomeworkForFamily,
  fetchNotesForSessionLog,
  fetchStaffNotesWithSession,
  fetchVouchers,
  findOrCreateMondaySessionLog,
  markGoalMet,
  revokeVoucher,
  setBucketStatus,
  setHomeworkStatus,
  upsertBucketNote,
  upsertSessionAttendance,
} from '@/lib/lcp';
import { useDebouncedEffect } from '@/hooks/useDebouncedEffect';
import { RichTextField, RichOrPlainView } from './RichText';

const STATUSES: AttendanceStatus[] = ['on_time', 'late', 'no_show'];

// A voucher awarded before this fix (or on a re-load) whose exact row we
// couldn't confidently identify -- still shown as checked, but revoking it
// needs a real id, so this is a distinct state from "not awarded" (null).
const UNKNOWN_VOUCHER = '__unknown__';
type VoucherState = string | typeof UNKNOWN_VOUCHER | null;

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
  const [attendanceReason, setAttendanceReason] = useState<Record<string, string>>({});
  const [vouchers, setVouchers] = useState<Record<string, VoucherState>>({});
  const [voucherError, setVoucherError] = useState<string | null>(null);

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
  const [bucketSaveState, setBucketSaveState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'confirm_clear'>('idle');
  const [bucketSaveError, setBucketSaveError] = useState<string | null>(null);

  // Visibility only -- "is this bucket wrapped up for tonight" -- never a
  // lock. Lets Andrew/Audrey/Shelly see who's finished without asking.
  const [bucketStatus, setBucketStatusState] = useState<
    Record<MondayBucket, { completedBy: string | null; completedAt: string | null }>
  >({
    finance: { completedBy: null, completedAt: null },
    life_skills: { completedBy: null, completedAt: null },
    mentoring: { completedBy: null, completedAt: null },
  });

  const [liveGoals, setLiveGoals] = useState<Record<string, Goal[]>>({});
  const [liveHomework, setLiveHomework] = useState<Record<string, Homework[]>>({});
  const [addGoalOpen, setAddGoalOpen] = useState<Record<string, boolean>>({});
  const [goalDraft, setGoalDraft] = useState<Record<string, GoalDraft>>({});
  const [assignOpen, setAssignOpen] = useState<Record<string, boolean>>({});
  const [assignDraft, setAssignDraft] = useState<Record<string, AssignDraft>>({});

  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({});
  // Keyed by `${familyId}:${bucket}` -- history is scoped to whichever bucket
  // is open (Finance/Life Skills/Mentoring each only show their own past notes),
  // so a family's cached history can't leak across buckets.
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

      // Left unset (not defaulted to 'on_time') for anyone without a real
      // attendance row yet -- per Susanna, defaulting everyone to on-time
      // let two staff each assume the other had already checked attendance,
      // so a real late arrival went unmarked. Leaving it blank makes "nobody
      // has recorded this yet" visibly obvious instead of silently correct-
      // looking. See the "Not marked yet" badge below.
      const attMap: Record<string, AttendanceStatus> = {};
      const reasonMap: Record<string, string> = {};
      const voucherMap: Record<string, VoucherState> = {};
      for (const row of attRows as SessionAttendance[]) {
        attMap[row.family_id] = row.status;
        if (row.reason) reasonMap[row.family_id] = row.reason;
        voucherMap[row.family_id] = row.voucher_awarded ? UNKNOWN_VOUCHER : null;
      }
      // Try to resolve "awarded but which one" to a real, revokable id --
      // the one unspent voucher earned tonight, if there's exactly one.
      const awardedFamilyIds = Object.entries(voucherMap)
        .filter(([, v]) => v === UNKNOWN_VOUCHER)
        .map(([familyId]) => familyId);
      if (awardedFamilyIds.length > 0) {
        const resolved = await Promise.all(
          awardedFamilyIds.map(async (familyId) => {
            const list = await fetchVouchers(familyId);
            const match = list.find((v) => v.redemption_id == null && v.earned_at.slice(0, 10) === sessionDate);
            return [familyId, match?.id ?? UNKNOWN_VOUCHER] as const;
          }),
        );
        for (const [familyId, id] of resolved) voucherMap[familyId] = id;
      }
      setAttendance(attMap);
      setAttendanceReason(reasonMap);
      setVouchers(voucherMap);

      const grouped: Record<MondayBucket, Record<string, string>> = { finance: {}, life_skills: {}, mentoring: {} };
      for (const n of notes) {
        if (n.bucket) grouped[n.bucket][n.family_id] = n.body;
      }
      setNotesByBucket(grouped);
      setSavedNotesByBucket(structuredClone(grouped));
      setBucketStatusState(await fetchBucketStatus(logId));

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
    if (status === 'on_time') setAttendanceReason((prev) => ({ ...prev, [familyId]: '' }));
    if (!sessionLogId) return;
    await upsertSessionAttendance(sessionLogId, familyId, status, vouchers[familyId] != null, currentUserId, attendanceReason[familyId]);
  }

  async function saveAttendanceReason(familyId: string) {
    if (!sessionLogId) return;
    await upsertSessionAttendance(
      sessionLogId,
      familyId,
      attendance[familyId] ?? 'on_time',
      vouchers[familyId] != null,
      currentUserId,
      attendanceReason[familyId],
    );
  }

  function markAllPresent() {
    for (const f of families) void setStatus(f.id, 'on_time');
  }

  async function toggleFamilyVoucher(familyId: string) {
    if (!sessionLogId) return;
    setVoucherError(null);
    const current = vouchers[familyId] ?? null;

    if (current == null) {
      // Award it.
      const previous = current;
      setVouchers((prev) => ({ ...prev, [familyId]: UNKNOWN_VOUCHER }));
      try {
        const voucherId = await awardVoucher(familyId, 'Session attendance — Monday Mentoring', currentUserId);
        await upsertSessionAttendance(sessionLogId, familyId, attendance[familyId] ?? 'on_time', true, currentUserId);
        setVouchers((prev) => ({ ...prev, [familyId]: voucherId }));
      } catch (e) {
        setVouchers((prev) => ({ ...prev, [familyId]: previous }));
        setVoucherError(e instanceof Error ? e.message : 'Could not award voucher.');
      }
      return;
    }

    if (current === UNKNOWN_VOUCHER) {
      setVoucherError(
        "Can't undo this one automatically — it was awarded before this fix (or on a previous visit) and the exact record can't be identified safely. Ask Byron to remove it directly if it was a mistake.",
      );
      return;
    }

    // Revoke it.
    setVouchers((prev) => ({ ...prev, [familyId]: null }));
    try {
      await revokeVoucher(current);
      await upsertSessionAttendance(sessionLogId, familyId, attendance[familyId] ?? 'on_time', false, currentUserId);
    } catch (e) {
      setVouchers((prev) => ({ ...prev, [familyId]: current }));
      setVoucherError(e instanceof Error ? e.message : 'Could not undo voucher.');
    }
  }

  function setNoteDraft(bucket: MondayBucket, familyId: string, body: string) {
    setNotesByBucket((prev) => ({ ...prev, [bucket]: { ...prev[bucket], [familyId]: body } }));
    if (bucketSaveState !== 'idle') setBucketSaveState('idle');
  }

  // Explicit save, not tied to a field losing focus -- doesn't depend on
  // attendance being filled in, doesn't depend on which family/bucket was
  // touched last, and surfaces a real error instead of failing silently.
  //
  // requireConfirm controls whether edits to a note that ALREADY has saved
  // content are allowed to autosave. Autosave (the debounced effect below)
  // always passes true -- per Susanna, once a note has real saved text,
  // every further edit to it (typo fix or full rewrite, not just clearing
  // it) needs an explicit Save click, since that's what best protects
  // session notes from an accidental change going out unnoticed. A brand
  // new note (nothing saved yet for that family) still autosaves normally --
  // there's nothing to lose by autosaving a first draft. The "Save ___
  // notes" button passes requireConfirm: false, since a deliberate click IS
  // the confirmation.
  async function saveBucketNotes(bucket: MondayBucket, opts: { requireConfirm?: boolean } = {}) {
    if (!sessionLogId) return;
    const requireConfirm = opts.requireConfirm ?? true;
    setBucketSaveState('saving');
    setBucketSaveError(null);
    try {
      const drafts = notesByBucket[bucket];
      const saved = savedNotesByBucket[bucket];
      const changed = families.filter((f) => (drafts[f.id] ?? '').trim() !== (saved[f.id] ?? '').trim());
      const blockedEdits = changed.filter((f) => requireConfirm && (saved[f.id] ?? '').trim() !== '');
      const toWrite = changed.filter((f) => !blockedEdits.includes(f));

      await Promise.all(
        toWrite.map((f) => upsertBucketNote(sessionLogId, f.id, bucket, (drafts[f.id] ?? '').trim(), currentUserId)),
      );
      setSavedNotesByBucket((prev) => ({
        ...prev,
        [bucket]: { ...prev[bucket], ...Object.fromEntries(toWrite.map((f) => [f.id, drafts[f.id] ?? ''])) },
      }));

      if (blockedEdits.length > 0) {
        setBucketSaveState('confirm_clear');
        setBucketSaveError(
          `${blockedEdits.map((f) => f.display_name).join(', ')} — you edited an already-saved note. Click "Save ${MONDAY_BUCKET_LABEL[bucket]} notes" to confirm, or the previous text stays saved.`,
        );
      } else {
        setBucketSaveState('saved');
      }
    } catch (e) {
      setBucketSaveState('error');
      setBucketSaveError(e instanceof Error ? e.message : 'Could not save notes — try again.');
    }
  }

  // Autosave the open bucket a beat after typing pauses -- the "Save ___
  // notes" button below stays as a peace-of-mind action for anyone who wants
  // to confirm it landed, same idiom as the Thursday prep/curriculum notes.
  useDebouncedEffect(() => {
    if (!selectedBucket) return;
    const drafts = notesByBucket[selectedBucket];
    const saved = savedNotesByBucket[selectedBucket];
    const changed = families.some((f) => (drafts[f.id] ?? '').trim() !== (saved[f.id] ?? '').trim());
    if (changed) void saveBucketNotes(selectedBucket);
  }, [selectedBucket ? notesByBucket[selectedBucket] : null], 1500);

  // Visibility signal, not a lock -- the bucket stays fully editable either
  // way. Whoever's currently viewing it can flip it back off just as easily.
  async function toggleBucketDone(bucket: MondayBucket) {
    if (!sessionLogId) return;
    const wasDone = bucketStatus[bucket].completedAt != null;
    const previous = bucketStatus[bucket];
    setBucketStatusState((prev) => ({
      ...prev,
      [bucket]: wasDone
        ? { completedBy: null, completedAt: null }
        : { completedBy: 'You', completedAt: new Date().toISOString() },
    }));
    try {
      await setBucketStatus(sessionLogId, bucket, !wasDone, currentUserId);
    } catch {
      setBucketStatusState((prev) => ({ ...prev, [bucket]: previous }));
    }
  }

  async function toggleHistory(familyId: string, bucket: MondayBucket) {
    const key = `${familyId}:${bucket}`;
    setHistoryOpen((prev) => ({ ...prev, [key]: !prev[key] }));
    if (!historyByFamily[key]) {
      setHistoryByFamily((prev) => ({ ...prev, [key]: 'loading' }));
      const notes = await fetchStaffNotesWithSession(familyId, 3, bucket);
      setHistoryByFamily((prev) => ({ ...prev, [key]: notes }));
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
      {
        family_id: familyId,
        session_id: null,
        session_type: 'monday_mentoring',
        area: draft.area,
        title: draft.title.trim(),
        description: null,
        due_date: draft.due_date || null,
      },
      currentUserId,
    );
    const hw = await fetchHomeworkForFamily(familyId);
    setLiveHomework((prev) => ({ ...prev, [familyId]: hw.filter((h) => h.status !== 'complete') }));
    setAssignDraft((prev) => ({ ...prev, [familyId]: { title: '', area: 'general', due_date: '' } }));
    setAssignOpen((prev) => ({ ...prev, [familyId]: false }));
  }

  if (loading) return <p className="py-8 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading tonight's session…</p>;

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
          className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-sparrow-sage dark:bg-sparrow-green/15 px-3 py-1.5 text-sm font-semibold text-sparrow-green dark:text-sparrow-dark-green transition hover:bg-sparrow-sage/70 dark:hover:bg-sparrow-green/25"
        >
          Done for now
        </button>
        <div>
          <h2 className="font-serif text-xl font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">{SESSION_LOG_LABEL.monday_mentoring}</h2>
          <p className="mt-0.5 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
            {formatDateHeader(sessionDate)} · Shared log — everything above is already saved. Leaving
            doesn't finish or lock anything for the others tonight.
          </p>
        </div>
      </div>

      {/* Attendance */}
      <section className="rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <span className="field-label">Attendance</span>
          <button onClick={markAllPresent} className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green">
            Mark all on time
          </button>
        </div>
        <ul className="space-y-2">
          {families.map((f) => (
            <li
              key={f.id}
              className={`rounded-xl border p-2 ${
                attendance[f.id] == null
                  ? 'border-[#B8790A]/40 bg-[#B8790A]/5'
                  : 'border-sparrow-rule/70'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-36 shrink-0 truncate text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{f.display_name}</span>
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
                          : 'bg-sparrow-mist dark:bg-sparrow-dark-surface2 text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink'
                      }`}
                    >
                      {ATTENDANCE_LABEL[s]}
                    </button>
                  ))}
                </div>
                {attendance[f.id] == null && (
                  <span className="text-[11px] font-semibold text-[#B8790A]">Not marked yet</span>
                )}
                <label className="ml-auto flex items-center gap-1.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                  <input
                    type="checkbox"
                    checked={vouchers[f.id] != null}
                    onChange={() => void toggleFamilyVoucher(f.id)}
                    className="h-3.5 w-3.5 rounded border-sparrow-rule dark:border-sparrow-dark-border text-sparrow-green dark:text-sparrow-dark-green focus:ring-sparrow-green dark:focus:ring-sparrow-dark-green"
                  />
                  Voucher
                </label>
              </div>
              {(attendance[f.id] === 'late' || attendance[f.id] === 'no_show') && (
                <input
                  value={attendanceReason[f.id] ?? ''}
                  onChange={(e) => setAttendanceReason((prev) => ({ ...prev, [f.id]: e.target.value }))}
                  onBlur={() => void saveAttendanceReason(f.id)}
                  placeholder="Reason (optional) — e.g. sick, car trouble"
                  className="field-input mt-2"
                />
              )}
            </li>
          ))}
        </ul>
        {voucherError && <p className="mt-2 text-xs text-priority-p1">{voucherError}</p>}
      </section>

      {/* Bucket picker / active bucket */}
      <section className="mt-9">
        {selectedBucket === null ? (
          <>
            <span className="field-label">Choose a bucket</span>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              {MONDAY_BUCKETS.map((bucket) => {
                const { done, total } = bucketCompletion(bucket);
                const status = bucketStatus[bucket];
                return (
                  <button
                    key={bucket}
                    onClick={() => setSelectedBucket(bucket)}
                    className={`flex flex-col items-start gap-2 rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-4 text-left shadow-card transition hover:border-sparrow-green/40 ${BUCKET_CARD_BORDER[bucket]}`}
                  >
                    <h3 className="font-serif text-base font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">{MONDAY_BUCKET_LABEL[bucket]}</h3>
                    <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{MONDAY_BUCKET_DESCRIPTION[bucket]}</p>
                    <span
                      className={`rounded-full border px-2 py-1 text-[11px] font-bold ${
                        done === total && total > 0
                          ? 'border-sparrow-green dark:border-sparrow-dark-green bg-sparrow-green text-white'
                          : 'border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface text-sparrow-gray dark:text-sparrow-dark-gray'
                      }`}
                    >
                      {done} of {total} logged
                    </span>
                    {status.completedAt && (
                      <span className="text-[11px] font-medium text-sparrow-green dark:text-sparrow-dark-green">
                        ✓ Done for tonight{status.completedBy ? ` — ${status.completedBy}` : ''}
                      </span>
                    )}
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
                className="inline-flex items-center gap-1 rounded-full bg-sparrow-sage dark:bg-sparrow-green/15 px-3 py-1.5 text-sm font-semibold text-sparrow-green dark:text-sparrow-dark-green transition hover:bg-sparrow-sage/70 dark:hover:bg-sparrow-green/25"
              >
                ← All buckets
              </button>
              <div className="inline-flex gap-0.5 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-1">
                {MONDAY_BUCKETS.map((bucket) => {
                  const { done, total } = bucketCompletion(bucket);
                  const active = bucket === selectedBucket;
                  return (
                    <button
                      key={bucket}
                      onClick={() => setSelectedBucket(bucket)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        active ? 'bg-white dark:bg-sparrow-dark-surface text-sparrow-green dark:text-sparrow-dark-green shadow-sm' : 'text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink'
                      }`}
                    >
                      {MONDAY_BUCKET_LABEL[bucket]}
                      <span
                        className={`rounded-full px-1.5 text-[10px] ${
                          active ? 'bg-sparrow-sage dark:bg-sparrow-green/15 text-sparrow-green dark:text-sparrow-dark-green' : 'bg-white dark:bg-sparrow-dark-surface text-sparrow-gray dark:text-sparrow-dark-gray'
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
                  // Bucket included in the key -- otherwise switching from
                  // Finance to Life Skills for the same family wouldn't
                  // remount the note field, and its uncontrolled contentEditable
                  // would keep showing the old bucket's text (see
                  // feedback-stale-state-on-switch).
                  key={`${f.id}:${selectedBucket}`}
                  family={f}
                  bucket={selectedBucket}
                  note={notesByBucket[selectedBucket][f.id] ?? ''}
                  onNoteChange={(body) => setNoteDraft(selectedBucket, f.id, body)}
                  historyOpen={historyOpen[`${f.id}:${selectedBucket}`] ?? false}
                  historyData={historyByFamily[`${f.id}:${selectedBucket}`]}
                  onToggleHistory={() => toggleHistory(f.id, selectedBucket)}
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

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-sparrow-rule dark:border-sparrow-dark-border pt-4">
              <button
                onClick={() => void saveBucketNotes(selectedBucket, { requireConfirm: false })}
                disabled={bucketSaveState === 'saving'}
                className="btn-primary"
              >
                {bucketSaveState === 'saving' ? 'Saving…' : `Save ${MONDAY_BUCKET_LABEL[selectedBucket]} notes`}
              </button>
              {bucketSaveState === 'saved' && <span className="text-sm font-medium text-sparrow-green dark:text-sparrow-dark-green">Saved ✓</span>}
              {bucketSaveState === 'confirm_clear' && (
                <span className="text-sm font-medium text-[#B8790A]">{bucketSaveError}</span>
              )}
              {bucketSaveState === 'error' && (
                <span className="text-sm font-medium text-priority-p1">{bucketSaveError}</span>
              )}
              <label className="ml-auto flex items-center gap-1.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                <input
                  type="checkbox"
                  checked={bucketStatus[selectedBucket].completedAt != null}
                  onChange={() => void toggleBucketDone(selectedBucket)}
                  className="h-3.5 w-3.5 rounded border-sparrow-rule dark:border-sparrow-dark-border text-sparrow-green dark:text-sparrow-dark-green focus:ring-sparrow-green dark:focus:ring-sparrow-dark-green"
                />
                Done with {MONDAY_BUCKET_LABEL[selectedBucket]} for tonight
              </label>
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
        <button onClick={onOpenFamily} className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink hover:text-sparrow-green dark:hover:text-sparrow-dark-green hover:underline">
          {family.display_name}
        </button>
        <button onClick={onToggleHistory} className="text-xs font-semibold text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-green dark:hover:text-sparrow-dark-green">
          History {historyOpen ? '▴' : '▾'}
        </button>
      </div>

      {historyOpen && (
        <div className="mb-3 rounded-xl bg-white dark:bg-sparrow-dark-surface p-3">
          {historyData === 'loading' || historyData === undefined ? (
            <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Loading…</p>
          ) : historyData.length === 0 ? (
            <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">No prior {MONDAY_BUCKET_LABEL[bucket]} notes yet.</p>
          ) : (
            <ul className="space-y-2">
              {historyData.map((n) => (
                <li key={n.id} className="border-t border-sparrow-rule/70 pt-2 first:border-t-0 first:pt-0">
                  <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{dayLabel(n.created_at)}</p>
                  <RichOrPlainView text={n.body} />
                </li>
              ))}
            </ul>
          )}
          <button onClick={onOpenFamily} className="mt-2 text-xs font-semibold text-sparrow-green dark:text-sparrow-dark-green">
            See full history →
          </button>
        </div>
      )}

      <RichTextField
        initialValue={note}
        onChange={onNoteChange}
        toolbar
        minHeightRem={3}
        placeholder={`${family.display_name}'s ${bucket === 'finance' ? 'finance' : bucket === 'life_skills' ? 'life skills' : 'mentoring'} note…`}
      />

      {/* Goals — shared across all 3 buckets, not duplicated */}
      <div className="mt-3 border-t border-white/60 pt-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="field-label">Goals</span>
          <button onClick={onToggleAddGoal} className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green">
            {addGoalOpen ? 'Cancel' : '+ Add goal'}
          </button>
        </div>
        {goals.length === 0 && !addGoalOpen && <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">None yet.</p>}
        {goals.length > 0 && (
          <ul className="space-y-1.5">
            {goals.map((goal) => (
              <li key={goal.id} className="flex items-center gap-2 text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
                <input
                  type="checkbox"
                  onChange={() => onToggleGoalMet(goal.id)}
                  className="h-4 w-4 rounded border-sparrow-rule dark:border-sparrow-dark-border text-sparrow-green dark:text-sparrow-dark-green focus:ring-sparrow-green dark:focus:ring-sparrow-dark-green"
                />
                <span>
                  {GOAL_AREA_LABEL[goal.area]}: {goal.title}
                </span>
                {goal.due_date && (
                  <span className={`ml-auto shrink-0 text-xs ${isOverdue(goal.due_date) ? 'font-medium text-priority-p1' : 'text-sparrow-gray dark:text-sparrow-dark-gray'}`}>
                    {dueLabel(goal.due_date)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {addGoalOpen && (
          <div className="mt-2 space-y-2 rounded-xl bg-white dark:bg-sparrow-dark-surface p-3">
            <input
              type="text"
              value={goalDraft.title}
              onChange={(e) => onGoalDraftChange({ ...goalDraft, title: e.target.value })}
              placeholder="What is she working toward?"
              className="field-input"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-sparrow-gray dark:text-sparrow-dark-gray">Goal area</label>
                <select
                  value={goalDraft.area}
                  onChange={(e) => onGoalDraftChange({ ...goalDraft, area: e.target.value as GoalArea })}
                  className="field-input mt-0 w-full"
                >
                  {GOAL_AREAS.map((a) => (
                    <option key={a} value={a}>{GOAL_AREA_LABEL[a]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-sparrow-gray dark:text-sparrow-dark-gray">Due date</label>
                <input
                  type="date"
                  value={goalDraft.due_date}
                  onChange={(e) => onGoalDraftChange({ ...goalDraft, due_date: e.target.value })}
                  className="field-input mt-0 w-full"
                />
              </div>
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
          <button onClick={onToggleAssign} className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green">
            {assignOpen ? 'Cancel' : '+ Assign'}
          </button>
        </div>
        {homework.length === 0 && !assignOpen && <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">None yet.</p>}
        {homework.length > 0 && (
          <ul className="space-y-1.5">
            {homework.map((hw) => (
              <li key={hw.id} className="flex items-center gap-2 text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
                <input
                  type="checkbox"
                  onChange={() => onToggleHomeworkComplete(hw.id)}
                  className="h-4 w-4 rounded border-sparrow-rule dark:border-sparrow-dark-border text-sparrow-green dark:text-sparrow-dark-green focus:ring-sparrow-green dark:focus:ring-sparrow-dark-green"
                />
                <span>
                  {AREA_LABEL[hw.area]}: {hw.title}
                </span>
                {hw.due_date && (
                  <span className={`ml-auto shrink-0 text-xs ${isOverdue(hw.due_date) ? 'font-medium text-priority-p1' : 'text-sparrow-gray dark:text-sparrow-dark-gray'}`}>
                    {dueLabel(hw.due_date)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {assignOpen && (
          <div className="mt-2 space-y-2 rounded-xl bg-white dark:bg-sparrow-dark-surface p-3">
            <input
              type="text"
              value={assignDraft.title}
              onChange={(e) => onAssignDraftChange({ ...assignDraft, title: e.target.value })}
              placeholder="Homework title"
              className="field-input"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-sparrow-gray dark:text-sparrow-dark-gray">Homework area</label>
                <select
                  value={assignDraft.area}
                  onChange={(e) => onAssignDraftChange({ ...assignDraft, area: e.target.value as HomeworkArea })}
                  className="field-input mt-0 w-full"
                >
                  {HOMEWORK_AREAS.map((a) => (
                    <option key={a} value={a}>{AREA_LABEL[a]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-sparrow-gray dark:text-sparrow-dark-gray">Due date</label>
                <input
                  type="date"
                  value={assignDraft.due_date}
                  onChange={(e) => onAssignDraftChange({ ...assignDraft, due_date: e.target.value })}
                  className="field-input mt-0 w-full"
                />
              </div>
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
