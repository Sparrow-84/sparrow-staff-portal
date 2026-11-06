// "Snooze until…" and "Move off prayer team" for one prayer volunteer. The one place these
// buttons are built, so the Prayer Team tab and the prayer reminders on Partnerships Home
// always offer the same options with the same words.
import { useState } from 'react';
import {
  moveOffPrayerTeam,
  previewMoveOffPrayerTeam,
  snoozePrayerVolunteer,
  updatePrayerVolunteerSnooze,
  type MoveOffEffect,
  type PrayerVolunteer,
} from '@/lib/prayer';

function todayISO(): string {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
}

export function PrayerVolunteerActions({
  volunteer,
  onChanged,
}: {
  volunteer: PrayerVolunteer;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<'idle' | 'snooze' | 'move'>('idle');
  const [snoozeDate, setSnoozeDate] = useState('');
  const [effect, setEffect] = useState<MoveOffEffect | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await action();
      setMode('idle');
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  function startSnooze() {
    setSnoozeDate(volunteer.snoozed_until ?? todayISO());
    setMode('snooze');
  }

  async function startMove() {
    setErr(null);
    setMode('move');
    setEffect(null);
    try {
      setEffect(await previewMoveOffPrayerTeam(volunteer));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not check their Directory record.');
    }
  }

  const name = volunteer.full_name;
  const link = 'text-xs text-sparrow-green dark:text-sparrow-dark-green hover:underline disabled:opacity-50';
  const quiet = 'text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:underline disabled:opacity-50';

  return (
    <div className="space-y-2">
      {mode === 'snooze' && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            className="field-input mt-0 w-auto"
            value={snoozeDate}
            onChange={(e) => setSnoozeDate(e.target.value)}
          />
          <button
            onClick={() => snoozeDate && void run(() => snoozePrayerVolunteer(volunteer.id, snoozeDate))}
            disabled={busy || !snoozeDate}
            className="btn-primary py-1 text-xs"
          >
            Save
          </button>
          <button onClick={() => setMode('idle')} className="btn-secondary py-1 text-xs">Cancel</button>
        </div>
      )}

      {mode === 'move' && (
        <div className="rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist/40 dark:bg-sparrow-dark-surface2 px-3 py-2 space-y-2">
          {effect === null && !err && (
            <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Checking their Directory record…</p>
          )}
          {effect !== null && (
            <>
              <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">Move {name} off the prayer team?</p>
              <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                They'll move to "No longer active" in the Volunteers tab, and their prayer attendance history stays.{' '}
                {effect === 'archive'
                  ? 'Prayer was their only role with Sparrow, so their Directory record will be archived too. You can restore it anytime from the Directory\'s Archived tab.'
                  : effect === 'keep'
                    ? 'Their Directory record stays active for their other roles with Sparrow.'
                    : ''}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => void run(() => moveOffPrayerTeam(volunteer))}
                  disabled={busy}
                  className="btn-primary py-1 text-xs"
                >
                  {busy ? 'Moving…' : 'Move off prayer team'}
                </button>
                <button onClick={() => setMode('idle')} className="btn-secondary py-1 text-xs">Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      {mode === 'idle' && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {volunteer.snoozed_until ? (
            <>
              <button onClick={startSnooze} disabled={busy} className={link}>Change snooze date</button>
              <button
                onClick={() => void run(() => updatePrayerVolunteerSnooze(volunteer.id, null))}
                disabled={busy}
                className={quiet}
              >
                Clear snooze
              </button>
            </>
          ) : (
            <button onClick={startSnooze} disabled={busy} className={link}>Snooze until…</button>
          )}
          <button onClick={() => void startMove()} disabled={busy} className={quiet}>Move off prayer team</button>
        </div>
      )}

      {err && <p className="text-xs text-priority-p1">{err}</p>}
    </div>
  );
}
