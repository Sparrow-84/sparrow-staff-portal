import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { fetchSettings, saveSettings } from '@/lib/settings';
import { VALUES_FOOTER_EVENT } from '@/components/ValuesFooter';
import { updateMyProfile } from '@/lib/team';
import type { WorkSchedule } from '@/lib/types';

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function SettingsView() {
  const { profile } = useAuth();
  const [footer, setFooter] = useState(true);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  // Profile fields
  const [blurb, setBlurb] = useState('');
  const [scheduleDays, setScheduleDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [scheduleStart, setScheduleStart] = useState('09:00');
  const [scheduleEnd, setScheduleEnd] = useState('17:00');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    fetchSettings(profile.id)
      .then((s) => setFooter(s?.values_footer_enabled ?? true))
      .catch(() => {})
      .finally(() => setLoading(false));
    // Pre-fill profile fields from existing data
    setBlurb(profile.blurb ?? '');
    if (profile.work_schedule) {
      setScheduleDays(profile.work_schedule.days);
      setScheduleStart(profile.work_schedule.start);
      setScheduleEnd(profile.work_schedule.end);
    }
  }, [profile]);

  if (!profile) return null;

  async function saveProfile() {
    if (!profile) return;
    setProfileSaving(true);
    setProfileStatus(null);
    try {
      const schedule: WorkSchedule = { days: scheduleDays, start: scheduleStart, end: scheduleEnd };
      await updateMyProfile(profile.id, {
        blurb: blurb.trim() || null,
        work_schedule: scheduleDays.length > 0 ? schedule : null,
      });
      setProfileStatus('Profile saved.');
    } catch {
      setProfileStatus('Could not save — try again.');
    } finally {
      setProfileSaving(false);
    }
  }

  function toggleScheduleDay(day: string) {
    setScheduleDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

  async function toggleFooter(next: boolean) {
    setFooter(next);
    window.dispatchEvent(new CustomEvent(VALUES_FOOTER_EVENT, { detail: next }));
    await saveSettings(profile!.id, { values_footer_enabled: next });
  }

  async function resetHome() {
    await saveSettings(profile!.id, { home_layout: null });
    setStatus('Home layout reset to default — it’ll apply next time you open Home.');
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="font-serif text-2xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-sparrow-gray">Preferences for {profile.full_name}.</p>

      {loading ? (
        <p className="mt-8 text-sm text-sparrow-gray">Loading…</p>
      ) : (
        <div className="mt-8 space-y-4">

          {/* My Profile */}
          <section className="rounded-2xl border border-sparrow-rule bg-white p-4 shadow-card">
            <h2 className="mb-3 text-sm font-semibold text-sparrow-ink">My Profile</h2>
            <p className="mb-4 text-xs text-sparrow-gray">
              Visible to all staff on the Team page. Your role description is set by Susanna.
            </p>

            {profile.role_description && (
              <div className="mb-4">
                <p className="field-label">Role</p>
                <p className="mt-1 rounded-lg bg-sparrow-mist px-3 py-2 text-sm text-sparrow-gray">
                  {profile.role_description}
                </p>
              </div>
            )}

            <div className="mb-4">
              <label className="field-label" htmlFor="blurb">
                About me <span className="font-normal text-sparrow-gray">(optional)</span>
              </label>
              <textarea
                id="blurb"
                rows={2}
                value={blurb}
                onChange={(e) => setBlurb(e.target.value)}
                placeholder="e.g. Love hiking and great coffee. Ask me about…"
                className="field-input resize-none"
              />
            </div>

            <div className="mb-4">
              <p className="field-label">Typical working days</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {ALL_DAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleScheduleDay(day)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      scheduleDays.includes(day)
                        ? 'bg-sparrow-green text-white'
                        : 'bg-sparrow-mist text-sparrow-gray hover:text-sparrow-ink'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3">
              <div>
                <label className="field-label" htmlFor="sched-start">Typical start time</label>
                <input
                  id="sched-start"
                  type="time"
                  value={scheduleStart}
                  onChange={(e) => setScheduleStart(e.target.value)}
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="sched-end">Typical end time</label>
                <input
                  id="sched-end"
                  type="time"
                  value={scheduleEnd}
                  onChange={(e) => setScheduleEnd(e.target.value)}
                  className="field-input"
                />
              </div>
            </div>

            {profileStatus && (
              <p className={`mb-3 text-xs ${profileStatus.includes('Could not') ? 'text-priority-p1' : 'text-sparrow-green'}`}>
                {profileStatus}
              </p>
            )}

            <button
              onClick={() => void saveProfile()}
              disabled={profileSaving}
              className="btn-primary text-sm"
            >
              {profileSaving ? 'Saving…' : 'Save profile'}
            </button>
          </section>
          <section className="flex items-center justify-between gap-4 rounded-2xl border border-sparrow-rule bg-white p-4 shadow-card">
            <div>
              <p className="text-sm font-medium text-sparrow-ink">Values footer</p>
              <p className="text-xs text-sparrow-gray">
                A quiet rotating line of Sparrow’s mission and values at the bottom of every screen.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={footer}
              onClick={() => void toggleFooter(!footer)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${footer ? 'bg-sparrow-green' : 'bg-sparrow-rule'}`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${footer ? 'left-[1.375rem]' : 'left-0.5'}`}
              />
            </button>
          </section>

          <section className="flex items-center justify-between gap-4 rounded-2xl border border-sparrow-rule bg-white p-4 shadow-card">
            <div>
              <p className="text-sm font-medium text-sparrow-ink">Home dashboard</p>
              <p className="text-xs text-sparrow-gray">Reset your widget layout back to the default set and order.</p>
            </div>
            <button onClick={() => void resetHome()} className="btn-ghost border border-sparrow-rule">
              Reset layout
            </button>
          </section>

          {status && <p className="text-xs text-sparrow-green">{status}</p>}

          <p className="pt-2 text-xs text-sparrow-gray">
            More preferences (notifications, messaging, Todoist sync) arrive with later slices.
          </p>
        </div>
      )}
    </div>
  );
}
