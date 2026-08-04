import { useEffect, useState } from 'react';
import {
  EVENT_LABEL,
  SESSION_LOG_LABEL,
  type Family,
  type Homework,
  type LcpEvent,
  type LcpPhaseWithUnits,
  type SessionLog,
  type SessionLogType,
} from '@/lib/lcp-types';
import { fetchNotePreviewsForSessionLogs, fetchRecentSessionLogs, fetchSessionMentorContent, fetchSessionResources, fetchTodayEvents } from '@/lib/lcp';
import { timeLabel } from '@/lib/lcp-format';
import { computeCurriculumTrack } from '@/lib/curriculum-track';
import { CurriculumTrackVertical } from './CurriculumTrack';
import { MondaySessionPanel } from './MondaySessionPanel';
import { SessionLogByBucket } from './SessionLogByBucket';
import { SessionLogByParticipant } from './SessionLogByParticipant';
import { SessionLogEntry } from './SessionLogEntry';
import { SessionLogViewer } from './SessionLogViewer';
import { SessionSplitLayout, type MondayMentorContent, type ThursdayGuideContent } from './SessionSplitLayout';

type PastView = 'recent' | 'group' | 'participant' | 'bucket';

interface Props {
  families: Family[];
  homeworkByFamily: Map<string, Homework[]>;
  currentUserId: string;
  currentUserName: string;
  phases: LcpPhaseWithUnits[];
  programUnitId: number | null;
  programSessionId: number | null;
  onChanged: () => void;
  onOpenFamily: (familyId: string) => void;
}

type EntryConfig = {
  sessionType: SessionLogType;
  sessionDate: string;
  eventId: string | null;
  label: string;
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}


function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function SessionLog({ families, homeworkByFamily, currentUserId, currentUserName, phases, programUnitId, programSessionId, onChanged, onOpenFamily }: Props) {
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [todayEvents, setTodayEvents] = useState<LcpEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [entry, setEntry] = useState<EntryConfig | null>(null);
  const [viewing, setViewing] = useState<SessionLog | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [manualDate, setManualDate] = useState(todayISO());
  const [manualType, setManualType] = useState<SessionLogType>('monday_mentoring');

  const [mondayContent, setMondayContent] = useState<MondayMentorContent | null>(null);
  const [mondayLoading, setMondayLoading] = useState(false);
  const [thursdayGuideContent, setThursdayGuideContent] = useState<ThursdayGuideContent | null>(null);
  const [thursdayGuideLoading, setThursdayGuideLoading] = useState(false);
  const [pastView, setPastView] = useState<PastView>('recent');
  const [adHocPreviews, setAdHocPreviews] = useState<Record<string, string>>({});

  async function load() {
    try {
      const [r, ev] = await Promise.all([fetchRecentSessionLogs(8), fetchTodayEvents()]);
      setLogs(r);
      setTodayEvents(ev);
      const adHocIds = r.filter((l) => l.session_type === 'ad_hoc').map((l) => l.id);
      setAdHocPreviews(await fetchNotePreviewsForSessionLogs(adHocIds));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  // Monday Mentoring reads whatever the group most recently covered in
  // Thursday Group — the same session_id Thursday's filing just advanced.
  useEffect(() => {
    if (!entry || entry.sessionType !== 'monday_mentoring') return;
    if (programSessionId == null) {
      setMondayContent(null);
      return;
    }
    setMondayLoading(true);
    fetchSessionMentorContent(programSessionId)
      .then((s) => {
        setMondayContent(
          s
            ? {
                sessionNumber: s.session_number,
                sessionTitle: s.title,
                unitName: s.unit_name,
                phaseName: s.phase_name,
                brief: s.mentor_brief,
                handoutEcho: s.mentor_handout_echo,
                goingDeeper: s.mentor_going_deeper,
              }
            : null,
        );
      })
      .finally(() => setMondayLoading(false));
  }, [entry, programSessionId]);

  // Thursday Group's left pane shows the actual Teacher Guide for tonight's
  // session — "whatever comes right after the last one filed," same rule
  // SessionLogEntry uses to decide what it's about to file.
  useEffect(() => {
    if (!entry || entry.sessionType !== 'thursday_group') return;
    const allUnits = phases.flatMap((p) => p.units).sort((a, b) => a.sort_order - b.sort_order);
    const allSessions = allUnits.flatMap((u) => u.sessions).sort((a, b) => a.session_number - b.session_number);
    const lastCompletedIndex = programSessionId != null ? allSessions.findIndex((s) => s.id === programSessionId) : -1;
    const sessionToTeach = allSessions[lastCompletedIndex + 1] ?? null;
    if (!sessionToTeach) {
      setThursdayGuideContent(null);
      return;
    }
    setThursdayGuideLoading(true);
    fetchSessionResources(sessionToTeach.id)
      .then((resources) => {
        const guide = resources.find((r) => r.kind === 'teacher_guide') ?? null;
        setThursdayGuideContent({
          sessionNumber: sessionToTeach.session_number,
          sessionTitle: sessionToTeach.title,
          teacherGuide: guide?.content ?? null,
          teacherGuideDriveUrl: guide?.drive_url ?? null,
        });
      })
      .finally(() => setThursdayGuideLoading(false));
  }, [entry, phases, programSessionId]);

  function handleFiled() {
    setEntry(null);
    void load();
    onChanged();
  }

  if (entry) {
    return (
      <SessionSplitLayout
        sessionLabel={entry.label}
        sessionDate={entry.sessionDate}
        sessionType={entry.sessionType}
        mondayContent={mondayContent}
        mondayLoading={mondayLoading}
        thursdayGuideContent={thursdayGuideContent}
        thursdayGuideLoading={thursdayGuideLoading}
      >
        {entry.sessionType === 'monday_mentoring' ? (
          <MondaySessionPanel
            families={families}
            currentUserId={currentUserId}
            sessionDate={entry.sessionDate}
            eventId={entry.eventId}
            onBack={() => { setEntry(null); void load(); }}
            onOpenFamily={onOpenFamily}
            onChanged={onChanged}
          />
        ) : (
          <SessionLogEntry
            {...entry}
            families={families}
            homeworkByFamily={homeworkByFamily}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            phases={phases}
            programUnitId={programUnitId}
            programSessionId={programSessionId}
            onBack={() => setEntry(null)}
            onFiled={handleFiled}
            onOpenFamily={onOpenFamily}
          />
        )}
      </SessionSplitLayout>
    );
  }

  if (viewing) {
    return (
      <SessionLogViewer
        key={viewing.id}
        log={viewing}
        families={families}
        currentUserId={currentUserId}
        onBack={() => setViewing(null)}
        onChanged={() => { void load(); onChanged(); }}
        onOpenFamily={onOpenFamily}
      />
    );
  }

  function openManual() {
    setEntry({ sessionType: manualType, sessionDate: manualDate, eventId: null, label: SESSION_LOG_LABEL[manualType] });
    setShowDatePicker(false);
  }

  // Group logs by date for display
  const logsByDate = new Map<string, SessionLog[]>();
  for (const log of logs) {
    const list = logsByDate.get(log.session_date) ?? [];
    list.push(log);
    logsByDate.set(log.session_date, list);
  }

  if (loading) return <p className="py-8 text-sm text-sparrow-gray">Loading session log…</p>;

  const track = computeCurriculumTrack(phases, programUnitId, programSessionId);

  return (
    <div>

      <div className="grid gap-4 md:grid-cols-[1fr_11rem]">
      {/* ── Section 1: what you can log right now ───────────────────── */}
      <section className="rounded-2xl bg-sparrow-sage/40 p-4 sm:p-5">
        <h2 className="font-serif text-lg font-semibold text-sparrow-ink">Log tonight's session</h2>
        <p className="mt-0.5 text-sm text-sparrow-gray">
          Today's scheduled sessions, or start one for a different date.
        </p>

        {todayEvents.length > 0 && (
          <div className="mt-4 space-y-3">
            {todayEvents.map((ev) => {
              // Only curriculum/one_on_one calendar events map to a real session
              // type. Anything else (dinner, volunteer, other) doesn't get to
              // silently become "Ad-hoc" — that's how a mistagged calendar event
              // once passed as a real filed session. Log it manually below instead.
              const type: SessionLogType | null =
                ev.kind === 'curriculum' ? 'thursday_group'
                : ev.kind === 'one_on_one' ? 'monday_mentoring'
                : null;
              return (
                <div key={ev.id} className="rounded-2xl border border-sparrow-rule bg-white p-4 shadow-card">
                  <p className="font-medium text-sparrow-ink">{ev.title}</p>
                  <p className="mt-0.5 text-sm text-sparrow-gray">
                    {timeLabel(ev.starts_at)} · {families.length} {families.length === 1 ? 'family' : 'families'} active
                  </p>
                  <div className="mt-3">
                    {type ? (
                      <button
                        onClick={() => setEntry({ sessionType: type, sessionDate: todayISO(), eventId: ev.id, label: ev.title })}
                        className="btn-primary"
                      >
                        Log this session
                      </button>
                    ) : (
                      <p className="text-xs text-sparrow-gray">
                        This calendar event's type ({EVENT_LABEL[ev.kind]}) isn't one Session Log tracks — if this
                        should be a Thursday Group or Monday Mentoring session, check the calendar entry's type.
                        Otherwise, log a session manually below.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Manual / spontaneous */}
        <div className="mt-4">
          {!showDatePicker ? (
            <button
              onClick={() => setShowDatePicker(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-sparrow-green px-4 py-2 text-sm font-medium text-sparrow-green transition hover:bg-white"
            >
              + Log a different session
            </button>
          ) : (
            <div className="rounded-2xl border border-sparrow-rule bg-white p-4 shadow-card">
              <p className="mb-3 text-sm font-medium text-sparrow-ink">Log a session</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="field-label">Date</label>
                  <input
                    type="date"
                    value={manualDate}
                    max={todayISO()}
                    onChange={(e) => setManualDate(e.target.value > todayISO() ? todayISO() : e.target.value)}
                    className="field-input"
                  />
                </div>
                <div>
                  <label className="field-label">Session type</label>
                  <select
                    value={manualType}
                    onChange={(e) => setManualType(e.target.value as SessionLogType)}
                    className="field-input"
                  >
                    <option value="monday_mentoring">Monday Mentoring</option>
                    <option value="thursday_group">Thursday Group</option>
                    <option value="ad_hoc">Ad-hoc Session</option>
                  </select>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={openManual} className="btn-primary">Continue</button>
                <button onClick={() => setShowDatePicker(false)} className="btn-ghost">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </section>

      {track.currentUnit && (
        <div className="p-4">
          <CurriculumTrackVertical track={track} />
        </div>
      )}
      </div>

      {/* ── Section 2: what's already been logged ───────────────────── */}
      <section className="mt-10">
        <h2 className="font-serif text-lg font-semibold text-sparrow-ink">Past sessions</h2>
        <p className="mt-0.5 text-sm text-sparrow-gray">Everything logged so far, most recent first.</p>

        <div className="mt-4 inline-flex flex-wrap gap-0.5 rounded-xl border border-sparrow-rule bg-sparrow-mist p-1">
          {([
            ['recent', 'Recent'],
            ['group', 'Group Notes'],
            ['participant', 'By Participant'],
            ['bucket', 'By Monday Type'],
          ] as [PastView, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPastView(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                pastView === key ? 'bg-white text-sparrow-green shadow-sm' : 'text-sparrow-gray hover:text-sparrow-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {pastView === 'recent' && (
            <SessionLogList
              logsByDate={logsByDate}
              adHocPreviews={adHocPreviews}
              onSelect={setViewing}
              emptyMessage="No sessions logged in the past 8 weeks."
            />
          )}
          {pastView === 'group' && (
            <SessionLogList
              logsByDate={filterLogsByDate(logsByDate, (l) => l.session_type === 'thursday_group')}
              adHocPreviews={adHocPreviews}
              onSelect={setViewing}
              emptyMessage="No Thursday Group sessions logged in the past 8 weeks."
            />
          )}
          {pastView === 'participant' && <SessionLogByParticipant families={families} />}
          {pastView === 'bucket' && <SessionLogByBucket families={families} />}
        </div>
      </section>
    </div>
  );
}

function filterLogsByDate(logsByDate: Map<string, SessionLog[]>, predicate: (log: SessionLog) => boolean): Map<string, SessionLog[]> {
  const out = new Map<string, SessionLog[]>();
  for (const [date, list] of logsByDate) {
    const filtered = list.filter(predicate);
    if (filtered.length > 0) out.set(date, filtered);
  }
  return out;
}

function SessionLogList({
  logsByDate,
  adHocPreviews,
  onSelect,
  emptyMessage,
}: {
  logsByDate: Map<string, SessionLog[]>;
  adHocPreviews: Record<string, string>;
  onSelect: (log: SessionLog) => void;
  emptyMessage: string;
}) {
  if (logsByDate.size === 0) {
    return <p className="text-sm text-sparrow-gray">{emptyMessage}</p>;
  }
  return (
    <ul className="space-y-1">
      {Array.from(logsByDate.entries()).map(([date, dateLogs]) => (
        <li key={date} className="overflow-hidden rounded-xl border border-sparrow-rule bg-white">
          <div className="bg-sparrow-mist px-4 py-2">
            <span className="text-xs font-semibold text-sparrow-gray">{formatDate(date)}</span>
          </div>
          {dateLogs.map((log) => {
            const preview =
              log.session_type === 'thursday_group' ? log.group_note
              : log.session_type === 'ad_hoc' ? adHocPreviews[log.id]
              : null;
            return (
              <button
                key={log.id}
                onClick={() => onSelect(log)}
                className="flex w-full items-center gap-3 border-t border-sparrow-rule px-4 py-3 text-left hover:bg-sparrow-mist"
              >
                <span className="shrink-0 text-sm font-medium text-sparrow-ink">
                  {SESSION_LOG_LABEL[log.session_type]}
                </span>
                {preview && (
                  <span className="min-w-0 flex-1 truncate text-sm text-sparrow-gray">"{preview}"</span>
                )}
                {!preview && <span className="flex-1" />}
                <span className="shrink-0 text-xs text-sparrow-gray">
                  {log.attendance.length} {log.attendance.length === 1 ? 'family' : 'families'}
                </span>
                <span className="h-2 w-2 shrink-0 rounded-full bg-sparrow-green" title="Filed" />
              </button>
            );
          })}
        </li>
      ))}
    </ul>
  );
}
