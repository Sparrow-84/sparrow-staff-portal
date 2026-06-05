import { useCallback, useEffect, useState } from 'react';
import {
  ATTENDANCE_LABEL,
  EVENT_LABEL,
  type AttendanceStatus,
  type CurriculumSession,
  type Family,
  type LcpEvent,
} from '@/lib/lcp-types';
import {
  addStaffNote,
  awardVoucher,
  fetchAttendanceForEvent,
  markAttendance,
} from '@/lib/lcp';
import { dayLabel, timeLabel } from '@/lib/lcp-format';
import { Drawer } from './Drawer';

const STATUSES: AttendanceStatus[] = ['on_time', 'late', 'no_show'];

export function SessionBriefPanel({
  open,
  event,
  families,
  sessions,
  currentUserId,
  onClose,
  onChanged,
}: {
  open: boolean;
  event: LcpEvent | null;
  families: Family[];
  sessions: CurriculumSession[];
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [note, setNote] = useState('');
  const [awardVouchers, setAwardVouchers] = useState(true);
  const [busy, setBusy] = useState(false);

  const eventId = event?.id;
  const sessionLabel = event?.session_id
    ? sessions.find((s) => s.id === event.session_id)?.title ?? null
    : null;

  const loadAttendance = useCallback(async () => {
    if (!eventId) return;
    const rows = await fetchAttendanceForEvent(eventId);
    const map: Record<string, AttendanceStatus> = {};
    for (const r of rows) map[r.family_id] = r.status;
    setMarks(map);
  }, [eventId]);

  useEffect(() => {
    if (open && eventId) {
      setNote('');
      setAwardVouchers(true);
      void loadAttendance();
    }
  }, [open, eventId, loadAttendance]);

  if (!event) return null;

  async function mark(familyId: string, status: AttendanceStatus) {
    if (!eventId) return;
    setMarks((m) => ({ ...m, [familyId]: status }));
    await markAttendance(eventId, familyId, status, currentUserId);
  }

  async function markAllOnTime() {
    for (const f of families) await mark(f.id, 'on_time');
  }

  async function complete() {
    if (!event) return;
    setBusy(true);
    const present = families.filter((f) => marks[f.id] && marks[f.id] !== 'no_show');
    // File the session note to each present family's Staff Notes (internal).
    if (note.trim()) {
      for (const f of present) {
        await addStaffNote(f.id, `[${event.title}] ${note.trim()}`, currentUserId, event.session_id);
      }
    }
    // Award a voucher to each on-time family (on-time + homework = 1 voucher).
    if (awardVouchers) {
      for (const f of families) {
        if (marks[f.id] === 'on_time') {
          await awardVoucher(f.id, `On-time + homework · ${event.title}`, currentUserId);
        }
      }
    }
    setBusy(false);
    onChanged();
    onClose();
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={event.title}
      subtitle={`${EVENT_LABEL[event.kind]} · ${dayLabel(event.starts_at)} ${timeLabel(event.starts_at)}`}
      footer={
        <button onClick={complete} disabled={busy} className="btn-primary w-full">
          {busy ? 'Filing…' : 'Complete session & file'}
        </button>
      }
    >
      <div className="space-y-5">
        {sessionLabel && (
          <div className="rounded-xl bg-sparrow-mist p-3 text-sm">
            <p className="field-label">Curriculum</p>
            <p className="text-sparrow-ink">{sessionLabel}</p>
            <p className="mt-1 text-xs text-sparrow-gray">
              Teacher guide & materials open here once Curriculum Admin is live (Phase 2).
            </p>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between">
            <span className="field-label">Attendance</span>
            <button onClick={markAllOnTime} className="text-xs font-medium text-sparrow-green">
              Mark all on time
            </button>
          </div>
          <ul className="mt-2 space-y-2">
            {families.map((f) => (
              <li key={f.id} className="flex items-center gap-2 rounded-xl border border-sparrow-rule/70 p-2">
                <span className="flex-1 truncate text-sm font-medium text-sparrow-ink">{f.display_name}</span>
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => mark(f.id, s)}
                    className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${
                      marks[f.id] === s
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
              </li>
            ))}
          </ul>
        </div>

        <label className="flex items-center gap-2 text-sm text-sparrow-ink">
          <input
            type="checkbox"
            checked={awardVouchers}
            onChange={(e) => setAwardVouchers(e.target.checked)}
            className="h-4 w-4 rounded border-sparrow-rule text-sparrow-green focus:ring-sparrow-green"
          />
          Award a voucher to each on-time family
        </label>

        <div>
          <span className="field-label">Session note (internal)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="What happened in group — filed to each present family's notes."
            className="field-input"
          />
        </div>
      </div>
    </Drawer>
  );
}
