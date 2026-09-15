import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { MONDAY_GUIDE_INSTRUCTIONS, type LcpPhaseWithUnits, type SessionLogType } from '@/lib/lcp-types';
import { advanceAllFamiliesToSession, advanceProgramPosition } from '@/lib/lcp';
import { RichTextView } from './RichText';

function formatDateHeader(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export interface MondayMentorContent {
  sessionNumber: number;
  sessionTitle: string;
  unitName: string;
  phaseName: string;
  brief: string | null;
  handoutEcho: string | null;
  goingDeeper: string | null;
}

export interface ThursdayGuideContent {
  sessionNumber: number;
  sessionTitle: string;
  teacherGuide: string | null;
  teacherGuideDriveUrl: string | null;
}

export interface ThursdayNotes {
  prepNotes: string;
  curriculumNotes: string;
  onPrepNotesSave: (text: string) => void;
  onCurriculumNotesSave: (text: string) => void;
}

export function SessionSplitLayout({
  sessionLabel,
  sessionDate,
  sessionType,
  mondayContent,
  mondayLoading,
  thursdayGuideContent,
  thursdayGuideLoading,
  thursdayNotes,
  phases,
  currentUnitId,
  currentSessionId,
  currentUserId,
  onProgramPositionChanged,
  children,
}: {
  sessionLabel: string;
  sessionDate: string;
  sessionType?: SessionLogType;
  mondayContent?: MondayMentorContent | null;
  mondayLoading?: boolean;
  thursdayGuideContent?: ThursdayGuideContent | null;
  thursdayGuideLoading?: boolean;
  thursdayNotes?: ThursdayNotes | null;
  // Monday only: lets "Pick a different room" correct lcp_program_position
  // directly (same effect as the Progress tab's "Set position manually"),
  // for when Monday Mentoring is showing a stale session in the moment,
  // rather than sending Shelly off to a different screen to fix it.
  // currentUnitId/currentSessionId are the live lcp_program_position values
  // (same ones the parent already has), used only to seed the picker's
  // starting selection -- not string-matched against mondayContent.
  phases?: LcpPhaseWithUnits[];
  currentUnitId?: number | null;
  currentSessionId?: number | null;
  currentUserId?: string;
  onProgramPositionChanged?: () => void;
  children: ReactNode;
}) {
  const [notesOpen, setNotesOpen] = useState(true);
  const [textScale, setTextScale] = useState<'sm' | 'md' | 'lg'>(
    () => (localStorage.getItem('lcp-session-text-scale') as 'sm' | 'md' | 'lg' | null) ?? 'sm',
  );
  const [leftPct, setLeftPct] = useState(38);
  const [notes, setNotes] = useState('');
  const [prepDraft, setPrepDraft] = useState(thursdayNotes?.prepNotes ?? '');
  const [curriculumDraft, setCurriculumDraft] = useState(thursdayNotes?.curriculumNotes ?? '');
  const [justSaved, setJustSaved] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // ── Monday: "Pick a different room" quick-fix ──────────────────────
  const allUnits = useMemo(
    () => (phases ?? []).flatMap((p) => p.units).sort((a, b) => a.sort_order - b.sort_order),
    [phases],
  );
  const [pickingRoom, setPickingRoom] = useState(false);
  const [roomUnitId, setRoomUnitId] = useState<number | null>(null);
  const [roomSessionId, setRoomSessionId] = useState<number | null>(null);
  const [savingRoom, setSavingRoom] = useState(false);
  const [roomErr, setRoomErr] = useState<string | null>(null);

  function openRoomPicker() {
    const currentUnit = allUnits.find((u) => u.id === currentUnitId) ?? allUnits[0] ?? null;
    setRoomUnitId(currentUnit?.id ?? null);
    setRoomSessionId(currentUnit?.sessions.find((s) => s.id === currentSessionId)?.id ?? currentUnit?.sessions[0]?.id ?? null);
    setRoomErr(null);
    setPickingRoom(true);
  }

  async function saveRoomPick() {
    if (!currentUserId || roomSessionId == null || roomUnitId == null) return;
    setSavingRoom(true);
    setRoomErr(null);
    try {
      const unit = allUnits.find((u) => u.id === roomUnitId);
      const session = unit?.sessions.find((s) => s.id === roomSessionId);
      if (!unit || !session) throw new Error('Pick a session first.');
      await advanceProgramPosition(session.id, unit.id, currentUserId);
      await advanceAllFamiliesToSession(session.session_number);
      onProgramPositionChanged?.();
      setPickingRoom(false);
    } catch (e) {
      setRoomErr(e instanceof Error ? e.message : 'Could not update the position.');
    } finally {
      setSavingRoom(false);
    }
  }

  useEffect(() => { localStorage.setItem('lcp-session-text-scale', textScale); }, [textScale]);
  useEffect(() => { setPrepDraft(thursdayNotes?.prepNotes ?? ''); }, [thursdayNotes?.prepNotes]);
  useEffect(() => { setCurriculumDraft(thursdayNotes?.curriculumNotes ?? ''); }, [thursdayNotes?.curriculumNotes]);

  function saveBothNotes() {
    if (!thursdayNotes) return;
    if (prepDraft !== thursdayNotes.prepNotes) thursdayNotes.onPrepNotesSave(prepDraft);
    if (curriculumDraft !== thursdayNotes.curriculumNotes) thursdayNotes.onCurriculumNotesSave(curriculumDraft);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  }

  // Lock body scroll while session overlay is active
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Drag-to-resize handler
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.max(15, Math.min(80, pct)));
    }
    function onMouseUp() {
      isDragging.current = false;
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-white dark:bg-sparrow-dark-surface">
      {/* Top bar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface px-4 py-2.5 shadow-sm">
        <div className="min-w-0 flex-1">
          <span className="font-serif text-base font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">{sessionLabel}</span>
          <span className="ml-3 hidden text-xs text-sparrow-gray dark:text-sparrow-dark-gray sm:inline">
            {formatDateHeader(sessionDate)}
          </span>
        </div>
        {(sessionType === 'monday_mentoring' || sessionType === 'thursday_group') && (
          <div className="hidden items-center gap-0.5 rounded-lg bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-0.5 text-xs md:flex">
            {(['sm', 'md', 'lg'] as const).map((size) => (
              <button
                key={size}
                onClick={() => setTextScale(size)}
                title={size === 'sm' ? 'Small text' : size === 'md' ? 'Medium text' : 'Large text'}
                className={`rounded px-2 py-1 font-medium transition ${
                  textScale === size
                    ? 'bg-white dark:bg-sparrow-dark-surface text-sparrow-green dark:text-sparrow-dark-green shadow-sm'
                    : 'text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink'
                }`}
              >
                {size === 'sm' ? 'S' : size === 'md' ? 'M' : 'L'}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setNotesOpen((v) => !v)}
          className={`hidden rounded-lg px-3 py-1.5 text-xs font-medium transition md:block ${
            notesOpen
              ? 'bg-sparrow-sage dark:bg-sparrow-green/15 text-sparrow-green dark:text-sparrow-dark-green'
              : 'bg-sparrow-mist dark:bg-sparrow-dark-surface2 text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink'
          }`}
        >
          {notesOpen ? 'Hide notes' : '+ Notes'}
        </button>
      </div>

      {/* Split body */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">

        {/* Notes pane — desktop only */}
        {notesOpen && (
          <div
            className={`hidden shrink-0 flex-col overflow-hidden border-r border-sparrow-rule dark:border-sparrow-dark-border md:flex ${
              textScale !== 'sm' ? `rich-text-scale-${textScale}` : ''
            }`}
            style={{ width: `${leftPct}%` }}
          >
            {sessionType === 'monday_mentoring' ? (
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="shrink-0 border-b border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist dark:bg-sparrow-dark-surface2 px-4 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">
                    Monday Mentor Guide
                  </p>
                  <p className="text-[10px] text-sparrow-gray/70">
                    Same instructions every week — session content below changes weekly
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="mb-4 whitespace-pre-line rounded-lg bg-sparrow-sage/30 dark:bg-sparrow-green/15 p-3 text-xs italic leading-relaxed text-sparrow-ink dark:text-sparrow-dark-ink">
                    {MONDAY_GUIDE_INSTRUCTIONS}
                  </div>

                  {mondayLoading ? (
                    <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading this week's session…</p>
                  ) : mondayContent ? (
                    <>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-sparrow-gold">
                        {mondayContent.phaseName} · {mondayContent.unitName}
                      </p>
                      <p className="text-sm font-semibold text-sparrow-green dark:text-sparrow-dark-green">
                        Session {mondayContent.sessionNumber} · {mondayContent.sessionTitle}
                      </p>

                      {currentUserId && (!pickingRoom ? (
                        <button
                          onClick={openRoomPicker}
                          className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-sparrow-rule dark:border-sparrow-dark-border px-2.5 py-0.5 text-[11px] font-medium text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
                        >
                          Pick a different room →
                        </button>
                      ) : (
                        <div className="mt-2 mb-1 rounded-xl border border-sparrow-green/25 bg-sparrow-sage/30 dark:bg-sparrow-green/15 p-3">
                          <p className="mb-2 text-xs font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">We're actually on:</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={roomUnitId ?? ''}
                              onChange={(e) => {
                                const unitId = Number(e.target.value);
                                setRoomUnitId(unitId);
                                setRoomSessionId(allUnits.find((u) => u.id === unitId)?.sessions[0]?.id ?? null);
                              }}
                              className="rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface px-2 py-1 text-xs text-sparrow-ink dark:text-sparrow-dark-ink"
                            >
                              {allUnits.map((u) => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </select>
                            <select
                              value={roomSessionId ?? ''}
                              onChange={(e) => setRoomSessionId(Number(e.target.value))}
                              className="rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface px-2 py-1 text-xs text-sparrow-ink dark:text-sparrow-dark-ink"
                            >
                              {allUnits
                                .find((u) => u.id === roomUnitId)
                                ?.sessions.map((s, i, arr) => (
                                  <option key={s.id} value={s.id}>Session {i + 1} of {arr.length}: {s.title}</option>
                                ))}
                            </select>
                            <button
                              disabled={savingRoom || roomSessionId == null}
                              onClick={saveRoomPick}
                              className="btn-primary px-3 py-1 text-xs"
                            >
                              {savingRoom ? 'Updating…' : 'Update'}
                            </button>
                            <button
                              disabled={savingRoom}
                              onClick={() => setPickingRoom(false)}
                              className="text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray"
                            >
                              Cancel
                            </button>
                          </div>
                          {roomErr && <p className="mt-2 text-xs text-priority-p1">{roomErr}</p>}
                        </div>
                      ))}

                      <div className="mb-4 mt-4">
                        <p className="session-content-heading">Mentor Brief</p>
                        <RichTextView html={mondayContent.brief} empty="Not filled in yet — add it in Curriculum Admin." />
                      </div>
                      <div className="mb-4">
                        <p className="session-content-heading">From Her Handout</p>
                        <RichTextView html={mondayContent.handoutEcho} empty="Not filled in yet — add it in Curriculum Admin." />
                      </div>
                      <div>
                        <p className="session-content-heading">Going Deeper</p>
                        <RichTextView html={mondayContent.goingDeeper} empty="Not filled in yet — add it in Curriculum Admin." />
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
                      No Thursday session has been filed yet, so there's nothing for Monday to reference.
                    </p>
                  )}
                </div>
                <div className="shrink-0 border-t border-sparrow-rule dark:border-sparrow-dark-border">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full resize-none bg-white dark:bg-sparrow-dark-surface p-3 text-xs leading-relaxed text-sparrow-ink dark:text-sparrow-dark-ink outline-none placeholder:text-sparrow-rule dark:placeholder:text-sparrow-dark-border"
                    placeholder="Personal scratch notes — visible only here, not saved"
                  />
                </div>
              </div>
            ) : sessionType === 'thursday_group' ? (
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="shrink-0 border-b border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist dark:bg-sparrow-dark-surface2 px-4 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">
                    Teacher Guide
                  </p>
                  <p className="text-[10px] text-sparrow-gray/70">
                    Tonight's script — Slideshow &amp; Student Handout links are on the right
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {thursdayGuideLoading ? (
                    <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading tonight's guide…</p>
                  ) : thursdayGuideContent ? (
                    <>
                      <p className="mb-3 text-sm font-semibold text-sparrow-green dark:text-sparrow-dark-green">
                        Session {thursdayGuideContent.sessionNumber} · {thursdayGuideContent.sessionTitle}
                      </p>
                      {thursdayGuideContent.teacherGuide ? (
                        <RichTextView html={thursdayGuideContent.teacherGuide} />
                      ) : thursdayGuideContent.teacherGuideDriveUrl ? (
                        <a
                          href={thursdayGuideContent.teacherGuideDriveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline"
                        >
                          Open Teacher Guide ↗
                        </a>
                      ) : (
                        <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Not filled in yet — add it in Curriculum Admin.</p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
                      No session is currently positioned to teach — check the Progress tab.
                    </p>
                  )}
                </div>
                {thursdayNotes && (
                  <div className="shrink-0 border-t border-sparrow-rule dark:border-sparrow-dark-border">
                    <NotesAccordion
                      label="Prep notes"
                      draft={prepDraft}
                      onDraftChange={setPrepDraft}
                      onBlurSave={() => {
                        if (prepDraft !== thursdayNotes.prepNotes) thursdayNotes.onPrepNotesSave(prepDraft);
                      }}
                      placeholder="Want to add or reorganize something before this session? Write it here — visible to whoever else is prepping too."
                    />
                    <NotesAccordion
                      label="Curriculum notes"
                      draft={curriculumDraft}
                      onDraftChange={setCurriculumDraft}
                      onBlurSave={() => {
                        if (curriculumDraft !== thursdayNotes.curriculumNotes) thursdayNotes.onCurriculumNotesSave(curriculumDraft);
                      }}
                      placeholder="Notes about the curriculum itself — also shows up in Curriculum Admin next to this session's Teacher Guide."
                    />
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button onClick={saveBothNotes} className="btn-primary text-xs">Save notes</button>
                      {justSaved && <span className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green">Saved ✓</span>}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="shrink-0 border-b border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist dark:bg-sparrow-dark-surface2 px-4 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">
                    Session Notes
                  </p>
                  <p className="text-[10px] text-sparrow-gray/70">
                    Prep notes &amp; curriculum — visible only here, not saved
                  </p>
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="flex-1 resize-none bg-white dark:bg-sparrow-dark-surface p-4 font-mono text-sm leading-relaxed text-sparrow-ink dark:text-sparrow-dark-ink outline-none placeholder:text-sparrow-rule dark:placeholder:text-sparrow-dark-border"
                  placeholder={"Session goal:\n\nTalking points:\n• \n• \n\nDiscussion questions:\n• \n\nMaterials needed:"}
                />
              </>
            )}
          </div>
        )}

        {/* Drag handle — desktop only, only when notes open */}
        {notesOpen && (
          <div
            className="group relative hidden w-1.5 shrink-0 cursor-col-resize select-none bg-sparrow-rule/60 transition-colors hover:bg-sparrow-green/30 md:block"
            onMouseDown={() => {
              isDragging.current = true;
            }}
          >
            <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-1">
              <div className="h-1 w-1 rounded-full bg-sparrow-gray/50" />
              <div className="h-1 w-1 rounded-full bg-sparrow-gray/50" />
              <div className="h-1 w-1 rounded-full bg-sparrow-gray/50" />
            </div>
          </div>
        )}

        {/* Session log pane */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-4 py-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// Collapsed by default so the Teacher Guide keeps most of the screen --
// expand only when actually reading/writing one of these. Still autosaves on
// blur, same "just works" feel as the rest of the always-saving Thursday/
// Monday panels -- the "Save notes" button below both accordions (in the
// parent) is purely a peace-of-mind action covering whichever of the two
// fields has unsaved text, for staff about to navigate away.
function NotesAccordion({
  label,
  draft,
  onDraftChange,
  onBlurSave,
  placeholder,
}: {
  label: string;
  draft: string;
  onDraftChange: (text: string) => void;
  onBlurSave: () => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-sparrow-rule dark:border-sparrow-dark-border first:border-t-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
      >
        <span>{open ? '▾' : '▸'} {label}</span>
        {!open && draft.trim() && <span className="normal-case text-[10px] font-medium text-sparrow-green dark:text-sparrow-dark-green">has notes</span>}
      </button>
      {open && (
        <textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onBlur={onBlurSave}
          rows={3}
          className="w-full resize-none bg-white dark:bg-sparrow-dark-surface px-3 pb-3 text-xs leading-relaxed text-sparrow-ink dark:text-sparrow-dark-ink outline-none placeholder:text-sparrow-rule dark:placeholder:text-sparrow-dark-border"
          placeholder={placeholder}
        />
      )}
    </div>
  );
}
