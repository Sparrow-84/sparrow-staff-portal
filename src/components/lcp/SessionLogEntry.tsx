import { useEffect, useMemo, useState } from 'react';
import {
  AREA_LABEL,
  ATTENDANCE_LABEL,
  GOAL_AREAS,
  GOAL_AREA_LABEL,
  HOMEWORK_AREAS,
  type AttendanceStatus,
  type Family,
  type Goal,
  type GoalArea,
  type Homework,
  type HomeworkArea,
  type LcpPhaseWithUnits,
  type SessionLogType,
} from '@/lib/lcp-types';
import { dueLabel, isOverdue } from '@/lib/lcp-format';
import {
  addStaffNote,
  assignHomework,
  awardVoucher,
  createGoal,
  createSessionLog,
  fetchGoalsForFamily,
  fetchHomeworkForFamily,
  markGoalMet,
  setHomeworkStatus,
  upsertSessionAttendance,
  updateProgramPosition,
} from '@/lib/lcp';

const STATUSES: AttendanceStatus[] = ['on_time', 'late', 'no_show'];

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
  sessionType: SessionLogType;
  sessionDate: string;
  eventId: string | null;
  label: string;
  families: Family[];
  homeworkByFamily: Map<string, Homework[]>;
  currentUserId: string;
  currentUserName: string;
  phases: LcpPhaseWithUnits[];
  programUnitId: number | null;
  onBack: () => void;
  onFiled: () => void;
}

function formatDateHeader(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

export function SessionLogEntry({
  sessionType,
  sessionDate,
  eventId,
  label,
  families,
  homeworkByFamily,
  currentUserId,
  currentUserName,
  phases,
  programUnitId,
  onBack,
  onFiled,
}: Props) {
  // ── curriculum advance (thursday only) ───────────────────────────
  const allUnits = useMemo(
    () => phases.flatMap((p) => p.units).sort((a, b) => a.sort_order - b.sort_order),
    [phases],
  );
  const currentUnitIndex = programUnitId != null ? allUnits.findIndex((u) => u.id === programUnitId) : -1;
  const nextUnit = currentUnitIndex === -1 ? allUnits[0] : allUnits[currentUnitIndex + 1];

  const [filed, setFiled] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [advanceErr, setAdvanceErr] = useState<string | null>(null);

  // ── ad-hoc: family picker ──────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const activeFamilies: Family[] =
    sessionType === 'ad_hoc'
      ? families.filter((f) => selectedIds.has(f.id))
      : families;

  // ── attendance ────────────────────────────────────────────────────
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>(() =>
    Object.fromEntries(families.map((f) => [f.id, 'on_time'])),
  );

  // ── vouchers (Monday + Thursday only) ────────────────────────────
  const [vouchers, setVouchers] = useState<Set<string>>(new Set());

  // ── notes ─────────────────────────────────────────────────────────
  const [familyNotes, setFamilyNotes] = useState<Record<string, string>>({});
  const [groupNote, setGroupNote] = useState('');

  // ── homework ──────────────────────────────────────────────────────
  const [liveHomework, setLiveHomework] = useState<Record<string, Homework[]>>(() => {
    const map: Record<string, Homework[]> = {};
    for (const f of families) {
      map[f.id] = (homeworkByFamily.get(f.id) ?? []).filter((h) => h.status !== 'complete');
    }
    return map;
  });
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState<Record<string, boolean>>({});
  const [assignDraft, setAssignDraft] = useState<Record<string, AssignDraft>>({});

  // ── goals ─────────────────────────────────────────────────────────
  const [liveGoals, setLiveGoals] = useState<Record<string, Goal[]>>({});
  const [metGoalIds, setMetGoalIds] = useState<Set<string>>(new Set());
  const [addGoalOpen, setAddGoalOpen] = useState<Record<string, boolean>>({});
  const [goalDraft, setGoalDraft] = useState<Record<string, GoalDraft>>({});

  // refresh homework + goals per family if prop changes (families added/removed)
  useEffect(() => {
    async function loadData() {
      const hwUpdates: Record<string, Homework[]> = {};
      const goalUpdates: Record<string, Goal[]> = {};
      await Promise.all(
        families.map(async (f) => {
          const [hw, goals] = await Promise.all([
            fetchHomeworkForFamily(f.id),
            fetchGoalsForFamily(f.id),
          ]);
          hwUpdates[f.id] = hw.filter((h) => h.status !== 'complete');
          goalUpdates[f.id] = goals.filter((g) => g.status !== 'met');
        }),
      );
      setLiveHomework(hwUpdates);
      setLiveGoals(goalUpdates);
    }
    void loadData();
  }, [families]);

  // ── filing ────────────────────────────────────────────────────────
  const [filing, setFiling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fileSession() {
    if (sessionType === 'ad_hoc' && selectedIds.size === 0) {
      setError('Select at least one family before filing.');
      return;
    }
    setFiling(true);
    setError(null);
    try {
      const logId = await createSessionLog({
        session_date: sessionDate,
        session_type: sessionType,
        event_id: eventId,
        group_note: groupNote.trim() || null,
        created_by: currentUserId,
      });

      for (const family of activeFamilies) {
        const status = attendance[family.id] ?? 'on_time';
        const voucherAwarded = vouchers.has(family.id);

        await upsertSessionAttendance(logId, family.id, status, voucherAwarded, currentUserId);

        if (voucherAwarded) {
          await awardVoucher(family.id, `Session attendance — ${label}`, currentUserId);
        }

        const note = familyNotes[family.id];
        if (note?.trim()) {
          await addStaffNote(family.id, note.trim(), currentUserId, null, logId);
        }

        // mark completed homework
        for (const hwId of completedIds) {
          const hw = liveHomework[family.id]?.find((h) => h.id === hwId);
          if (hw) await setHomeworkStatus(hwId, 'complete');
        }

        // new homework assignments
        const draft = assignDraft[family.id];
        if (assignOpen[family.id] && draft?.title.trim()) {
          await assignHomework(
            {
              family_id: family.id,
              session_id: null,
              area: draft.area,
              title: draft.title.trim(),
              description: null,
              due_date: draft.due_date || null,
            },
            currentUserId,
          );
        }

        // goals marked met tonight
        for (const goalId of metGoalIds) {
          const goal = liveGoals[family.id]?.find((g) => g.id === goalId);
          if (goal) await markGoalMet(goalId);
        }

        // new goals set tonight
        const gDraft = goalDraft[family.id];
        if (addGoalOpen[family.id] && gDraft?.title.trim()) {
          await createGoal(
            {
              family_id: family.id,
              area: gDraft.area,
              title: gDraft.title.trim(),
              due_date: gDraft.due_date || null,
            },
            currentUserId,
          );
        }
      }

      if (sessionType === 'thursday_group' && nextUnit) {
        setFiled(true);
      } else {
        onFiled();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not file session.');
    } finally {
      setFiling(false);
    }
  }

  async function advanceCurriculum() {
    if (!nextUnit) return;
    setAdvancing(true);
    setAdvanceErr(null);
    try {
      await updateProgramPosition(nextUnit.id, currentUserId);
      onFiled();
    } catch (e) {
      setAdvanceErr(e instanceof Error ? e.message : 'Could not advance curriculum.');
      setAdvancing(false);
    }
  }

  function toggleAttendance(familyId: string, status: AttendanceStatus) {
    setAttendance((prev) => ({ ...prev, [familyId]: status }));
  }

  function toggleVoucher(familyId: string) {
    setVouchers((prev) => {
      const next = new Set(prev);
      if (next.has(familyId)) next.delete(familyId); else next.add(familyId);
      return next;
    });
  }

  function markAllPresent() {
    setAttendance(Object.fromEntries(families.map((f) => [f.id, 'on_time'])));
  }

  function toggleComplete(hwId: string) {
    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (next.has(hwId)) next.delete(hwId); else next.add(hwId);
      return next;
    });
  }

  function toggleGoalMet(goalId: string) {
    setMetGoalIds((prev) => {
      const next = new Set(prev);
      if (next.has(goalId)) next.delete(goalId); else next.add(goalId);
      return next;
    });
  }

  const isThursday = sessionType === 'thursday_group';
  const isAdHoc = sessionType === 'ad_hoc';
  const showVouchers = !isAdHoc;

  if (filed && nextUnit) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-sparrow-rule bg-white p-5 shadow-card">
          <p className="text-sm font-medium text-sparrow-green">Session filed ✓</p>
          <p className="mt-3 text-sm text-sparrow-ink">
            Complete unit and advance curriculum to{' '}
            <span className="font-semibold">{nextUnit.name}</span>?
          </p>
          {advanceErr && <p className="mt-2 text-sm text-priority-p1">{advanceErr}</p>}
          <div className="mt-4 flex gap-3">
            <button
              disabled={advancing}
              onClick={advanceCurriculum}
              className="btn-primary"
            >
              {advancing ? 'Saving…' : 'Complete unit'}
            </button>
            <button
              disabled={advancing}
              onClick={onFiled}
              className="btn-ghost"
            >
              Not yet
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={onBack} className="mt-0.5 text-sm text-sparrow-gray hover:text-sparrow-ink">
          ← Back
        </button>
        <div>
          <h2 className="font-serif text-xl font-semibold text-sparrow-ink">
            {isAdHoc ? 'Ad-hoc Session' : label}
          </h2>
          <p className="mt-0.5 text-sm text-sparrow-gray">
            {formatDateHeader(sessionDate)}
            {currentUserName && <span> · Filing as {currentUserName}</span>}
          </p>
        </div>
      </div>

      {/* Ad-hoc: family picker */}
      {isAdHoc && (
        <section className="rounded-2xl border border-sparrow-rule bg-white p-4 shadow-card">
          <p className="mb-3 field-label">Who was present?</p>
          <div className="space-y-2">
            {families.map((f) => (
              <label key={f.id} className="flex cursor-pointer items-center gap-2 text-sm text-sparrow-ink">
                <input
                  type="checkbox"
                  checked={selectedIds.has(f.id)}
                  onChange={() => {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(f.id)) next.delete(f.id); else next.add(f.id);
                      return next;
                    });
                  }}
                  className="h-4 w-4 rounded border-sparrow-rule text-sparrow-green focus:ring-sparrow-green"
                />
                {f.display_name}
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Attendance + vouchers (Monday + Thursday) */}
      {!isAdHoc && (
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
                      onClick={() => toggleAttendance(f.id, s)}
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
                {showVouchers && (
                  <label className="ml-auto flex items-center gap-1.5 text-xs text-sparrow-gray">
                    <input
                      type="checkbox"
                      checked={vouchers.has(f.id)}
                      onChange={() => toggleVoucher(f.id)}
                      className="h-3.5 w-3.5 rounded border-sparrow-rule text-sparrow-green focus:ring-sparrow-green"
                    />
                    Voucher
                  </label>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Thursday: shared group note */}
      {isThursday && (
        <section className="rounded-2xl border border-sparrow-rule bg-white p-4 shadow-card">
          <label className="field-label">Group session note</label>
          <p className="mb-2 text-xs text-sparrow-gray">Shared recap of the session — visible to all LCP staff.</p>
          <textarea
            value={groupNote}
            onChange={(e) => setGroupNote(e.target.value)}
            rows={4}
            placeholder="What happened tonight — curriculum covered, group energy, themes that came up…"
            className="field-input"
          />
        </section>
      )}

      {/* Per-family sections */}
      {activeFamilies.map((f) => (
        <FamilySection
          key={f.id}
          family={f}
          sessionType={sessionType}
          note={familyNotes[f.id] ?? ''}
          onNoteChange={(v) => setFamilyNotes((prev) => ({ ...prev, [f.id]: v }))}
          isThursday={isThursday}
          homework={liveHomework[f.id] ?? []}
          completedIds={completedIds}
          onToggleComplete={toggleComplete}
          assignOpen={assignOpen[f.id] ?? false}
          onToggleAssign={() => setAssignOpen((prev) => ({ ...prev, [f.id]: !prev[f.id] }))}
          assignDraft={assignDraft[f.id] ?? { title: '', area: 'general', due_date: '' }}
          onAssignChange={(d) => setAssignDraft((prev) => ({ ...prev, [f.id]: d }))}
          goals={liveGoals[f.id] ?? []}
          metGoalIds={metGoalIds}
          onToggleGoalMet={toggleGoalMet}
          addGoalOpen={addGoalOpen[f.id] ?? false}
          onToggleAddGoal={() => setAddGoalOpen((prev) => ({ ...prev, [f.id]: !prev[f.id] }))}
          goalDraft={goalDraft[f.id] ?? { title: '', area: 'relational', due_date: '' }}
          onGoalDraftChange={(d) => setGoalDraft((prev) => ({ ...prev, [f.id]: d }))}
        />
      ))}

      {activeFamilies.length === 0 && isAdHoc && (
        <p className="text-sm text-sparrow-gray">Select at least one family above to log notes.</p>
      )}

      {/* Error + file button */}
      {error && <p className="text-sm text-priority-p1">{error}</p>}

      <button
        onClick={fileSession}
        disabled={filing}
        className="btn-primary w-full"
      >
        {filing ? 'Filing…' : 'File session'}
      </button>
    </div>
  );
}

// ── FamilySection ────────────────────────────────────────────────────

interface FamilySectionProps {
  family: Family;
  sessionType: SessionLogType;
  note: string;
  onNoteChange: (v: string) => void;
  isThursday: boolean;
  homework: Homework[];
  completedIds: Set<string>;
  onToggleComplete: (id: string) => void;
  assignOpen: boolean;
  onToggleAssign: () => void;
  assignDraft: AssignDraft;
  onAssignChange: (d: AssignDraft) => void;
  goals: Goal[];
  metGoalIds: Set<string>;
  onToggleGoalMet: (id: string) => void;
  addGoalOpen: boolean;
  onToggleAddGoal: () => void;
  goalDraft: GoalDraft;
  onGoalDraftChange: (d: GoalDraft) => void;
}

function FamilySection({
  family,
  isThursday,
  note,
  onNoteChange,
  homework,
  completedIds,
  onToggleComplete,
  assignOpen,
  onToggleAssign,
  assignDraft,
  onAssignChange,
  goals,
  metGoalIds,
  onToggleGoalMet,
  addGoalOpen,
  onToggleAddGoal,
  goalDraft,
  onGoalDraftChange,
}: FamilySectionProps) {
  const openHw = homework.filter((h) => !completedIds.has(h.id));
  const openGoals = goals.filter((g) => !metGoalIds.has(g.id));

  return (
    <section className="rounded-2xl border border-sparrow-rule bg-white p-4 shadow-card">
      <p className="mb-3 font-medium text-sparrow-ink">{family.display_name}</p>

      {/* Note */}
      <div className="mb-4">
        <label className="field-label">
          {isThursday ? 'Private note (not shared with group)' : 'Session note'}
        </label>
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          rows={isThursday ? 2 : 3}
          placeholder={
            isThursday
              ? `Quick private note about ${family.display_name}…`
              : `Your notes from tonight's session with ${family.display_name}…`
          }
          className="field-input"
        />
      </div>

      {/* Goals */}
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="field-label">Goals</span>
          <button onClick={onToggleAddGoal} className="text-xs font-medium text-sparrow-green">
            {addGoalOpen ? 'Cancel' : '+ Add goal'}
          </button>
        </div>

        {openGoals.length === 0 && !addGoalOpen && (
          <p className="text-xs text-sparrow-gray">No active goals.</p>
        )}

        {openGoals.length > 0 && (
          <ul className="space-y-1.5">
            {openGoals.map((goal) => (
              <li key={goal.id} className="flex items-center gap-2 text-sm text-sparrow-ink">
                <input
                  type="checkbox"
                  checked={metGoalIds.has(goal.id)}
                  onChange={() => onToggleGoalMet(goal.id)}
                  className="h-4 w-4 rounded border-sparrow-rule text-sparrow-green focus:ring-sparrow-green"
                />
                <span className={metGoalIds.has(goal.id) ? 'line-through text-sparrow-gray' : ''}>
                  {goal.title}
                </span>
                <span className="text-xs text-sparrow-gray">· {GOAL_AREA_LABEL[goal.area]}</span>
                {goal.due_date && (
                  <span className={`ml-auto shrink-0 text-xs ${isOverdue(goal.due_date) && !metGoalIds.has(goal.id) ? 'font-medium text-priority-p1' : 'text-sparrow-gray'}`}>
                    {dueLabel(goal.due_date)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Inline add-goal form */}
        {addGoalOpen && (
          <div className="mt-3 space-y-2 rounded-xl border border-sparrow-rule bg-sparrow-mist p-3">
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
                placeholder="Due date (optional)"
              />
            </div>
            <p className="text-xs text-sparrow-gray">Saved when you file the session.</p>
          </div>
        )}
      </div>

      {/* Homework */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="field-label">Homework</span>
          <button onClick={onToggleAssign} className="text-xs font-medium text-sparrow-green">
            {assignOpen ? 'Cancel' : '+ Assign'}
          </button>
        </div>

        {openHw.length === 0 && !assignOpen && (
          <p className="text-xs text-sparrow-gray">No open homework.</p>
        )}

        {openHw.length > 0 && (
          <ul className="space-y-1.5">
            {openHw.map((hw) => (
              <li key={hw.id} className="flex items-center gap-2 text-sm text-sparrow-ink">
                <input
                  type="checkbox"
                  checked={completedIds.has(hw.id)}
                  onChange={() => onToggleComplete(hw.id)}
                  className="h-4 w-4 rounded border-sparrow-rule text-sparrow-green focus:ring-sparrow-green"
                />
                <span className={completedIds.has(hw.id) ? 'line-through text-sparrow-gray' : ''}>
                  {hw.title}
                </span>
                {hw.due_date && (
                  <span className={`ml-auto shrink-0 text-xs ${isOverdue(hw.due_date) && !completedIds.has(hw.id) ? 'font-medium text-priority-p1' : 'text-sparrow-gray'}`}>
                    {dueLabel(hw.due_date)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Inline assign form */}
        {assignOpen && (
          <div className="mt-3 space-y-2 rounded-xl border border-sparrow-rule bg-sparrow-mist p-3">
            <input
              type="text"
              value={assignDraft.title}
              onChange={(e) => onAssignChange({ ...assignDraft, title: e.target.value })}
              placeholder="Homework title"
              className="field-input"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={assignDraft.area}
                onChange={(e) => onAssignChange({ ...assignDraft, area: e.target.value as HomeworkArea })}
                className="field-input"
              >
                {HOMEWORK_AREAS.map((a) => (
                  <option key={a} value={a}>{AREA_LABEL[a]}</option>
                ))}
              </select>
              <input
                type="date"
                value={assignDraft.due_date}
                onChange={(e) => onAssignChange({ ...assignDraft, due_date: e.target.value })}
                className="field-input"
                placeholder="Due date (optional)"
              />
            </div>
            <p className="text-xs text-sparrow-gray">Saved when you file the session.</p>
          </div>
        )}
      </div>
    </section>
  );
}
