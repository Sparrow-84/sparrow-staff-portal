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
  type Resource,
  type SessionLogType,
} from '@/lib/lcp-types';
import { dueLabel, isOverdue } from '@/lib/lcp-format';
import {
  advanceAllFamiliesToSession,
  advanceProgramPosition,
  assignHomework,
  awardVoucher,
  createGoal,
  createSessionLog,
  fetchGoalsForFamily,
  fetchHomeworkForFamily,
  fetchSessionResources,
  finalizeThursdaySessionLog,
  markGoalMet,
  setHomeworkStatus,
  updateSessionLog,
  upsertFamilySessionNote,
  upsertSessionAttendance,
} from '@/lib/lcp';
import { useRequiredFields } from '@/hooks/useRequiredFields';
import { useDebouncedEffect } from '@/hooks/useDebouncedEffect';
import { computeCurriculumTrack } from '@/lib/curriculum-track';
import { CurriculumTrackHorizontal } from './CurriculumTrack';
import { RichTextField } from './RichText';

// Ad-hoc sessions don't get a real session-log row until "File session" is
// clicked, so there's no safe DB row to autosave family notes against yet --
// a local draft is the fallback so typed notes survive a navigate-away in
// the meantime. Thursday/Monday always have a row from the moment the
// screen opens, so they get real autosave instead (see below).
function adHocDraftKey(sessionDate: string): string {
  return `lcp-adhoc-note-draft:${sessionDate}`;
}

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
  sessionLogId: string | null;
  label: string;
  families: Family[];
  homeworkByFamily: Map<string, Homework[]>;
  currentUserId: string;
  currentUserName: string;
  phases: LcpPhaseWithUnits[];
  programUnitId: number | null;
  programSessionId: number | null;
  onBack: () => void;
  onFiled: () => void;
  onOpenFamily: (familyId: string) => void;
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
  sessionLogId,
  label,
  families,
  homeworkByFamily,
  currentUserId,
  currentUserName,
  phases,
  programUnitId,
  programSessionId,
  onBack,
  onFiled,
  onOpenFamily,
}: Props) {
  // ── curriculum advance (thursday only) ────────────────────────────
  // The group moves together, so "the session to teach tonight" is simply
  // whatever comes right after the last one filed (programSessionId). Filing
  // tonight's session advances the pointer to it — that same pointer is what
  // Monday Mentoring reads afterward as "the session she recently attended."
  const allUnits = useMemo(
    () => phases.flatMap((p) => p.units).sort((a, b) => a.sort_order - b.sort_order),
    [phases],
  );
  const allSessions = useMemo(
    () => allUnits.flatMap((u) => u.sessions).sort((a, b) => a.session_number - b.session_number),
    [allUnits],
  );
  const lastCompletedIndex = programSessionId != null ? allSessions.findIndex((s) => s.id === programSessionId) : -1;
  const sessionToTeach = allSessions[lastCompletedIndex + 1] ?? null;
  const willCrossUnit = programUnitId != null && sessionToTeach != null && sessionToTeach.unit_id !== programUnitId;
  const nextUnit = willCrossUnit ? allUnits.find((u) => u.id === sessionToTeach!.unit_id) ?? null : null;

  const [filed, setFiled] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [advanceErr, setAdvanceErr] = useState<string | null>(null);

  // ── tonight's materials (Thursday only) — quick access to what's needed
  // live during the session, without leaving this screen ────────────────
  const [tonightResources, setTonightResources] = useState<Resource[]>([]);
  useEffect(() => {
    if (sessionType !== 'thursday_group' || !sessionToTeach) {
      setTonightResources([]);
      return;
    }
    let cancelled = false;
    fetchSessionResources(sessionToTeach.id).then((rs) => {
      if (!cancelled) setTonightResources(rs);
    });
    return () => { cancelled = true; };
  }, [sessionType, sessionToTeach?.id]);
  const tonightSlideshow = tonightResources.find((r) => r.kind === 'ppt') ?? null;
  const tonightHandout = tonightResources.find((r) => r.kind === 'handout') ?? null;

  // ── ad-hoc: family picker ──────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const activeFamilies: Family[] =
    sessionType === 'ad_hoc'
      ? families.filter((f) => selectedIds.has(f.id))
      : families;

  // ── attendance ────────────────────────────────────────────────────
  // Starts empty rather than defaulting everyone to on-time -- per Susanna,
  // that default let two staff each assume the other had already checked
  // attendance, so a real late arrival went unmarked. Leaving it blank makes
  // "nobody's recorded this yet" visibly obvious. See the required-field
  // check in fileSession() below and the "Not marked yet" badge in the render.
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [attendanceReason, setAttendanceReason] = useState<Record<string, string>>({});

  // ── vouchers (Monday + Thursday only) ────────────────────────────
  const [vouchers, setVouchers] = useState<Set<string>>(new Set());

  // ── notes ─────────────────────────────────────────────────────────
  const [familyNotes, setFamilyNotes] = useState<Record<string, string>>(() => {
    if (sessionType !== 'ad_hoc') return {};
    try {
      const raw = localStorage.getItem(adHocDraftKey(sessionDate));
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch {
      return {};
    }
  });
  const [groupNote, setGroupNote] = useState('');

  // Thursday/Monday: real DB row exists from the moment this screen opened,
  // so autosave writes there directly. Ad-hoc: no row yet until filed, so
  // fall back to a local draft (cleared once the session is actually filed).
  useDebouncedEffect(() => {
    if (!(sessionType === 'thursday_group' && sessionLogId)) return;
    void updateSessionLog(sessionLogId, groupNote.trim() || null);
  }, [groupNote], 1500);

  useDebouncedEffect(() => {
    if (sessionType === 'thursday_group' && sessionLogId) {
      for (const family of activeFamilies) {
        const note = familyNotes[family.id];
        if (note != null) void upsertFamilySessionNote(sessionLogId, family.id, note.trim(), currentUserId);
      }
      return;
    }
    if (sessionType === 'ad_hoc') {
      try {
        localStorage.setItem(adHocDraftKey(sessionDate), JSON.stringify(familyNotes));
      } catch {
        // best-effort draft only
      }
    }
  }, [familyNotes], 1500);

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

  const { missingMessage, validate, fieldClass, fieldError, clear } = useRequiredFields([
    { key: 'sle-family-picker', label: 'At least one family present', valid: sessionType !== 'ad_hoc' || selectedIds.size > 0 },
    {
      key: 'sle-attendance',
      // Ad-hoc sessions don't show the attendance section at all (no fixed
      // roster to mark against), so only require this for Monday/Thursday.
      label: 'Attendance for everyone present',
      valid: sessionType === 'ad_hoc' || activeFamilies.every((f) => attendance[f.id] != null),
    },
  ]);

  async function fileSession() {
    if (!validate()) return;
    setFiling(true);
    setError(null);
    try {
      // Thursday's log row already exists (created as soon as this screen was
      // opened, so prep notes had somewhere to save) -- finalize it in place
      // rather than inserting a second row for the same evening. Ad-hoc keeps
      // the old one-row-per-filing behavior; filing IS creation for it.
      const logId =
        sessionType === 'thursday_group' && sessionLogId
          ? await finalizeThursdaySessionLog(sessionLogId, groupNote.trim() || null).then(() => sessionLogId)
          : await createSessionLog({
              session_date: sessionDate,
              session_type: sessionType,
              event_id: eventId,
              group_note: groupNote.trim() || null,
              created_by: currentUserId,
              filed_at: new Date().toISOString(),
            });

      for (const family of activeFamilies) {
        const status = attendance[family.id] ?? 'on_time';
        const voucherAwarded = vouchers.has(family.id);

        await upsertSessionAttendance(logId, family.id, status, voucherAwarded, currentUserId, attendanceReason[family.id]);

        if (voucherAwarded) {
          await awardVoucher(family.id, `Session attendance — ${label}`, currentUserId);
        }

        const note = familyNotes[family.id];
        if (note?.trim()) {
          // Upsert, not insert -- Thursday may already have autosaved this
          // family's note against the same logId, so this just finalizes it
          // rather than creating a duplicate row.
          await upsertFamilySessionNote(logId, family.id, note.trim(), currentUserId);
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
              session_type: sessionType,
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

      if (sessionType === 'ad_hoc') {
        try {
          localStorage.removeItem(adHocDraftKey(sessionDate));
        } catch {
          // best-effort cleanup only
        }
      }

      if (sessionType === 'thursday_group' && sessionToTeach) {
        // Whether to actually advance is always Shelly's call, not automatic --
        // she may want another night on the same session either way, not just
        // at a unit boundary. Tonight's attendance/notes/homework/goals above
        // are already saved regardless of what she picks next.
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
    if (!sessionToTeach) return;
    setAdvancing(true);
    setAdvanceErr(null);
    try {
      await advanceProgramPosition(sessionToTeach.id, sessionToTeach.unit_id, currentUserId);
      await advanceAllFamiliesToSession(sessionToTeach.session_number);
      onFiled();
    } catch (e) {
      setAdvanceErr(e instanceof Error ? e.message : 'Could not advance curriculum.');
      setAdvancing(false);
    }
  }

  function toggleAttendance(familyId: string, status: AttendanceStatus) {
    setAttendance((prev) => ({ ...prev, [familyId]: status }));
    if (status === 'on_time') setAttendanceReason((prev) => ({ ...prev, [familyId]: '' }));
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
    setAttendanceReason({});
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

  if (filed && sessionToTeach) {
    // programSessionId (the prop) is still last week's position here -- the
    // real advance only happens if "Session complete" below is clicked.
    // Tonight's session was just filed though, so treat it as current for
    // this FYI screen: here's what you just covered, here's what's next.
    const track = computeCurriculumTrack(phases, sessionToTeach.unit_id, sessionToTeach.id);
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-5 shadow-card">
          <p className="text-sm font-medium text-sparrow-green dark:text-sparrow-dark-green">Session filed ✓</p>
          {track.currentUnit && (
            <div className="mt-3">
              <CurriculumTrackHorizontal track={track} />
            </div>
          )}
          <p className="mt-3 text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
            {willCrossUnit ? (
              <>
                Session complete? This moves into a new unit —{' '}
                <span className="font-semibold">{nextUnit!.name}</span>.
              </>
            ) : (
              'Session complete? This moves forward to the next session.'
            )}{' '}
            If the group needs another night on this one, that's fine — pick "Not yet" and it'll come up again next time.
          </p>
          {advanceErr && <p className="mt-2 text-sm text-priority-p1">{advanceErr}</p>}
          <div className="mt-4 flex gap-3">
            <button
              disabled={advancing}
              onClick={advanceCurriculum}
              className="btn-primary"
            >
              {advancing ? 'Saving…' : 'Session complete'}
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
        <button
          onClick={onBack}
          className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-sparrow-sage dark:bg-sparrow-green/15 px-3 py-1.5 text-sm font-semibold text-sparrow-green dark:text-sparrow-dark-green transition hover:bg-sparrow-sage/70 dark:hover:bg-sparrow-green/25"
        >
          ← Back
        </button>
        <div>
          <h2 className="font-serif text-xl font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">
            {isAdHoc ? 'Ad-hoc Session' : label}
          </h2>
          <p className="mt-0.5 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
            {formatDateHeader(sessionDate)}
            {currentUserName && <span> · Filing as {currentUserName}</span>}
          </p>
        </div>
      </div>

      {/* Ad-hoc: family picker */}
      {isAdHoc && (
        <section id="sle-family-picker" className={fieldClass('sle-family-picker', 'rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4 shadow-card')}>
          <p className="mb-3 field-label field-label-required">Who was present?</p>
          <div className="space-y-2">
            {families.map((f) => (
              <label key={f.id} className="flex cursor-pointer items-center gap-2 text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
                <input
                  type="checkbox"
                  checked={selectedIds.has(f.id)}
                  onChange={() => {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(f.id)) next.delete(f.id); else next.add(f.id);
                      return next;
                    });
                    clear('sle-family-picker');
                  }}
                  className="h-4 w-4 rounded border-sparrow-rule dark:border-sparrow-dark-border text-sparrow-green dark:text-sparrow-dark-green focus:ring-sparrow-green dark:focus:ring-sparrow-dark-green"
                />
                {f.display_name}
              </label>
            ))}
          </div>
          {fieldError('sle-family-picker') && <p className="mt-1 text-xs text-priority-p1">{fieldError('sle-family-picker')}</p>}
        </section>
      )}

      {/* Attendance + vouchers (Monday + Thursday) */}
      {!isAdHoc && (
        <section
          id="sle-attendance"
          className="rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4 shadow-card"
        >
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
                  attendance[f.id] == null ? 'border-[#B8790A]/40 bg-[#B8790A]/5' : 'border-sparrow-rule/70'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-36 shrink-0 truncate text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{f.display_name}</span>
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
                  {showVouchers && (
                    <label className="ml-auto flex items-center gap-1.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                      <input
                        type="checkbox"
                        checked={vouchers.has(f.id)}
                        onChange={() => toggleVoucher(f.id)}
                        className="h-3.5 w-3.5 rounded border-sparrow-rule dark:border-sparrow-dark-border text-sparrow-green dark:text-sparrow-dark-green focus:ring-sparrow-green dark:focus:ring-sparrow-dark-green"
                      />
                      Voucher
                    </label>
                  )}
                </div>
                {(attendance[f.id] === 'late' || attendance[f.id] === 'no_show') && (
                  <input
                    value={attendanceReason[f.id] ?? ''}
                    onChange={(e) => setAttendanceReason((prev) => ({ ...prev, [f.id]: e.target.value }))}
                    placeholder="Reason (optional) — e.g. sick, car trouble"
                    className="field-input mt-2"
                  />
                )}
              </li>
            ))}
          </ul>
          {fieldError('sle-attendance') && <p className="mt-2 text-xs text-priority-p1">{fieldError('sle-attendance')}</p>}
        </section>
      )}

      {/* Thursday: which session tonight covers */}
      {isThursday && (
        <section className="rounded-2xl border border-sparrow-green/30 bg-sparrow-sage/20 dark:bg-sparrow-green/15 p-4 shadow-card">
          {sessionToTeach ? (
            <>
              <p className="field-label">Tonight</p>
              <p className="mt-1 text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">
                Session {sessionToTeach.session_number} · {sessionToTeach.title}
              </p>

              {/* Quick access to tonight's materials — Teacher Guide itself is on the left */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {tonightSlideshow?.drive_url ? (
                  <a
                    href={tonightSlideshow.drive_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-white dark:bg-sparrow-dark-surface px-3 py-1.5 text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green shadow-sm ring-1 ring-sparrow-rule transition hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2"
                  >
                    Open Slideshow ↗
                  </a>
                ) : (
                  <span className="rounded-lg px-3 py-1.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Slideshow not added</span>
                )}
                {tonightHandout?.drive_url ? (
                  <a
                    href={tonightHandout.drive_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-white dark:bg-sparrow-dark-surface px-3 py-1.5 text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green shadow-sm ring-1 ring-sparrow-rule transition hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2"
                  >
                    Open Student Handout ↗
                  </a>
                ) : (
                  <span className="rounded-lg px-3 py-1.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Handout not added</span>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
              No more sessions left in the curriculum to advance to.
            </p>
          )}
        </section>
      )}

      {/* Thursday: shared group note */}
      {isThursday && (
        <section className="rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4 shadow-card">
          <label className="field-label">Group session note</label>
          <p className="mb-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Shared recap of the session — visible to all LCP staff.</p>
          <RichTextField
            initialValue={groupNote}
            onChange={setGroupNote}
            toolbar
            minHeightRem={5}
            placeholder="What happened tonight — curriculum covered, group energy, themes that came up…"
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
          onOpenFamily={onOpenFamily}
        />
      ))}

      {activeFamilies.length === 0 && isAdHoc && (
        <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Select at least one family above to log notes.</p>
      )}

      {/* Error + file button */}
      {(error || missingMessage) && <p className="text-sm text-priority-p1">{error ?? missingMessage}</p>}

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
  onOpenFamily: (familyId: string) => void;
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
  onOpenFamily,
}: FamilySectionProps) {
  const openHw = homework.filter((h) => !completedIds.has(h.id));
  const openGoals = goals.filter((g) => !metGoalIds.has(g.id));

  return (
    <section className="rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4 shadow-card">
      <button
        onClick={() => onOpenFamily(family.id)}
        className="mb-3 font-medium text-sparrow-ink dark:text-sparrow-dark-ink hover:text-sparrow-green dark:hover:text-sparrow-dark-green hover:underline"
        title={`See ${family.display_name}'s past notes and goals`}
      >
        {family.display_name}
      </button>

      {/* Note */}
      <div className="mb-4">
        <label className="field-label">
          {isThursday ? 'Private note (not shared with group)' : 'Session note'}
        </label>
        <RichTextField
          initialValue={note}
          onChange={onNoteChange}
          toolbar
          minHeightRem={isThursday ? 3 : 4}
          placeholder={
            isThursday
              ? `Quick private note about ${family.display_name}…`
              : `Your notes from tonight's session with ${family.display_name}…`
          }
        />
      </div>

      {/* Goals */}
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="field-label">Goals</span>
          <button onClick={onToggleAddGoal} className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green">
            {addGoalOpen ? 'Cancel' : '+ Add goal'}
          </button>
        </div>

        {openGoals.length === 0 && !addGoalOpen && (
          <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">No active goals.</p>
        )}

        {openGoals.length > 0 && (
          <ul className="space-y-1.5">
            {openGoals.map((goal) => (
              <li key={goal.id} className="flex items-center gap-2 text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
                <input
                  type="checkbox"
                  checked={metGoalIds.has(goal.id)}
                  onChange={() => onToggleGoalMet(goal.id)}
                  className="h-4 w-4 rounded border-sparrow-rule dark:border-sparrow-dark-border text-sparrow-green dark:text-sparrow-dark-green focus:ring-sparrow-green dark:focus:ring-sparrow-dark-green"
                />
                <span className={metGoalIds.has(goal.id) ? 'line-through text-sparrow-gray dark:text-sparrow-dark-gray' : ''}>
                  {goal.title}
                </span>
                <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">· {GOAL_AREA_LABEL[goal.area]}</span>
                {goal.due_date && (
                  <span className={`ml-auto shrink-0 text-xs ${isOverdue(goal.due_date) && !metGoalIds.has(goal.id) ? 'font-medium text-priority-p1' : 'text-sparrow-gray dark:text-sparrow-dark-gray'}`}>
                    {dueLabel(goal.due_date)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Inline add-goal form */}
        {addGoalOpen && (
          <div className="mt-3 space-y-2 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-3">
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
                  placeholder="Optional"
                />
              </div>
            </div>
            <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Saved when you file the session.</p>
          </div>
        )}
      </div>

      {/* Homework */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="field-label">Homework</span>
          <button onClick={onToggleAssign} className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green">
            {assignOpen ? 'Cancel' : '+ Assign'}
          </button>
        </div>

        {openHw.length === 0 && !assignOpen && (
          <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">No open homework.</p>
        )}

        {openHw.length > 0 && (
          <ul className="space-y-1.5">
            {openHw.map((hw) => (
              <li key={hw.id} className="flex items-center gap-2 text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
                <input
                  type="checkbox"
                  checked={completedIds.has(hw.id)}
                  onChange={() => onToggleComplete(hw.id)}
                  className="h-4 w-4 rounded border-sparrow-rule dark:border-sparrow-dark-border text-sparrow-green dark:text-sparrow-dark-green focus:ring-sparrow-green dark:focus:ring-sparrow-dark-green"
                />
                <span className={completedIds.has(hw.id) ? 'line-through text-sparrow-gray dark:text-sparrow-dark-gray' : ''}>
                  {hw.title}
                </span>
                {hw.due_date && (
                  <span className={`ml-auto shrink-0 text-xs ${isOverdue(hw.due_date) && !completedIds.has(hw.id) ? 'font-medium text-priority-p1' : 'text-sparrow-gray dark:text-sparrow-dark-gray'}`}>
                    {dueLabel(hw.due_date)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Inline assign form */}
        {assignOpen && (
          <div className="mt-3 space-y-2 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-3">
            <input
              type="text"
              value={assignDraft.title}
              onChange={(e) => onAssignChange({ ...assignDraft, title: e.target.value })}
              placeholder="Homework title"
              className="field-input"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-sparrow-gray dark:text-sparrow-dark-gray">Homework area</label>
                <select
                  value={assignDraft.area}
                  onChange={(e) => onAssignChange({ ...assignDraft, area: e.target.value as HomeworkArea })}
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
                  onChange={(e) => onAssignChange({ ...assignDraft, due_date: e.target.value })}
                  className="field-input mt-0 w-full"
                  placeholder="Optional"
                />
              </div>
            </div>
            <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Saved when you file the session.</p>
          </div>
        )}
      </div>
    </section>
  );
}
