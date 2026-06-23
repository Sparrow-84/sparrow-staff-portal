import { useEffect, useState } from 'react';
import {
  SESSION_LOG_LABEL,
  type Family,
  type Homework,
  type LcpEvent,
  type SessionLog,
  type SessionLogType,
} from '@/lib/lcp-types';
import { fetchRecentSessionLogs, fetchTodayEvents } from '@/lib/lcp';
import { timeLabel } from '@/lib/lcp-format';
import { SessionLogEntry } from './SessionLogEntry';
import { SessionLogViewer } from './SessionLogViewer';

interface Props {
  families: Family[];
  homeworkByFamily: Map<string, Homework[]>;
  currentUserId: string;
  currentUserName: string;
  onChanged: () => void;
}

type EntryConfig = {
  sessionType: SessionLogType;
  sessionDate: string;
  eventId: string | null;
  label: string;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function todayDow() {
  return new Date().getDay(); // 0=Sun, 1=Mon ... 4=Thu
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function SessionLog({ families, homeworkByFamily, currentUserId, currentUserName, onChanged }: Props) {
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [todayEvents, setTodayEvents] = useState<LcpEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [entry, setEntry] = useState<EntryConfig | null>(null);
  const [viewing, setViewing] = useState<SessionLog | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [manualDate, setManualDate] = useState(todayISO());
  const [manualType, setManualType] = useState<SessionLogType>('monday_mentoring');

  async function load() {
    try {
      const [r, ev] = await Promise.all([fetchRecentSessionLogs(8), fetchTodayEvents()]);
      setLogs(r);
      setTodayEvents(ev);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function handleFiled() {
    setEntry(null);
    void load();
    onChanged();
  }

  if (entry) {
    return (
      <SessionLogEntry
        {...entry}
        families={families}
        homeworkByFamily={homeworkByFamily}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        onBack={() => setEntry(null)}
        onFiled={handleFiled}
      />
    );
  }

  if (viewing) {
    return (
      <SessionLogViewer
        log={viewing}
        families={families}
        currentUserId={currentUserId}
        onBack={() => setViewing(null)}
        onChanged={() => { void load(); onChanged(); }}
      />
    );
  }

  // Suggest tonight's session type based on day of week
  const dow = todayDow();
  const tonightType: SessionLogType | null =
    dow === 1 ? 'monday_mentoring' : dow === 4 ? 'thursday_group' : null;

  function openTonight(type: SessionLogType, eventId: string | null = null) {
    setEntry({ sessionType: type, sessionDate: todayISO(), eventId, label: SESSION_LOG_LABEL[type] });
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

  return (
    <div className="space-y-6">

      {/* Tonight suggestion */}
      {tonightType && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sparrow-gray">Tonight</h2>
          <div className="rounded-2xl border border-sparrow-rule bg-white p-4 shadow-card">
            <p className="font-medium text-sparrow-ink">{SESSION_LOG_LABEL[tonightType]}</p>
            <p className="mt-0.5 text-sm text-sparrow-gray">
              {families.length} {families.length === 1 ? 'family' : 'families'} active
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => openTonight(tonightType)}
                className="btn-primary"
              >
                Log this session
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Today's calendar events (if any) */}
      {todayEvents.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
            Today's scheduled events
          </h2>
          <ul className="divide-y divide-sparrow-rule overflow-hidden rounded-xl border border-sparrow-rule bg-white">
            {todayEvents.map((ev) => {
              const type: SessionLogType =
                ev.kind === 'curriculum' ? 'thursday_group'
                : ev.kind === 'one_on_one' ? 'monday_mentoring'
                : 'ad_hoc';
              return (
                <li key={ev.id}>
                  <button
                    onClick={() => setEntry({ sessionType: type, sessionDate: todayISO(), eventId: ev.id, label: ev.title })}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-sparrow-mist"
                  >
                    <span className="w-16 shrink-0 text-xs text-sparrow-gray">{timeLabel(ev.starts_at)}</span>
                    <span className="flex-1 text-sm font-medium text-sparrow-ink">{ev.title}</span>
                    <span className="shrink-0 text-xs text-sparrow-gray">Log →</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Manual / spontaneous */}
      {!showDatePicker ? (
        <button
          onClick={() => setShowDatePicker(true)}
          className="text-sm font-medium text-sparrow-green hover:underline"
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
                onChange={(e) => setManualDate(e.target.value)}
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

      {/* Recent session logs */}
      {logsByDate.size > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sparrow-gray">Recent sessions</h2>
          <ul className="space-y-1">
            {Array.from(logsByDate.entries()).map(([date, dateLogs]) => (
              <li key={date} className="overflow-hidden rounded-xl border border-sparrow-rule bg-white">
                <div className="bg-sparrow-mist px-4 py-2">
                  <span className="text-xs font-semibold text-sparrow-gray">{formatDate(date)}</span>
                </div>
                {dateLogs.map((log) => (
                  <button
                    key={log.id}
                    onClick={() => setViewing(log)}
                    className="flex w-full items-center gap-3 border-t border-sparrow-rule px-4 py-3 text-left hover:bg-sparrow-mist"
                  >
                    <span className="flex-1 text-sm font-medium text-sparrow-ink">
                      {SESSION_LOG_LABEL[log.session_type]}
                    </span>
                    <span className="text-xs text-sparrow-gray">
                      {log.attendance.length} {log.attendance.length === 1 ? 'family' : 'families'}
                    </span>
                    <span className="text-xs text-sparrow-gray">
                      Filed by {log.created_by_name ?? 'staff'}
                    </span>
                    <span className="h-2 w-2 shrink-0 rounded-full bg-sparrow-green" title="Filed" />
                  </button>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      {logsByDate.size === 0 && !tonightType && !loading && (
        <p className="text-sm text-sparrow-gray">No sessions logged in the past 8 weeks.</p>
      )}
    </div>
  );
}
