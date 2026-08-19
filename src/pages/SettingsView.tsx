import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { updateMyProfile, normalizeSchedule } from '@/lib/team';
import { checkPushSubscription, getPushPermission, requestPushPermission } from '@/lib/push';
import { applyTheme } from '@/lib/theme';
import type { ScheduleBlock } from '@/lib/types';

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const BLANK_BLOCK: ScheduleBlock = { days: [], start: '09:00', end: '17:00' };

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // Feb padded to 29 — year is a fixed placeholder, never stored/shown
// Placeholder year for month/day-only birthdays — 2000 is a leap year, so Feb 29 always round-trips.
const BIRTHDAY_YEAR = 2000;

function splitBirthday(value: string | null): { month: string; day: string } {
  if (!value) return { month: '', day: '' };
  const [, m, d] = value.split('-');
  return { month: m ?? '', day: d ?? '' };
}

function joinBirthday(month: string, day: string): string | null {
  if (!month || !day) return null;
  return `${BIRTHDAY_YEAR}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function SettingsView() {
  const { profile } = useAuth();

  // Profile fields
  const [blurb, setBlurb] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [scheduleBlocks, setScheduleBlocks] = useState<ScheduleBlock[]>([{ ...BLANK_BLOCK, days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] }]);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [pushBlocked, setPushBlocked] = useState(false);
  const [pushJustReset, setPushJustReset] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  // Only re-sync from the loaded profile when it's actually a different user's data
  // (profile.id changes) — not on every incidental refetch of the same profile
  // (e.g. Supabase's background session/token refresh), which would otherwise
  // silently overwrite whatever the user just toggled/typed here.
  useEffect(() => {
    if (!profile) return;
    setPushEnabled(profile.push_enabled ?? true);
    setPushBlocked(getPushPermission() === 'denied');
    setDarkMode(profile.dark_mode ?? false);
    setBlurb(profile.blurb ?? '');
    const { month, day } = splitBirthday(profile.birthday);
    setBirthMonth(month);
    setBirthDay(day);
    const blocks = normalizeSchedule(profile.work_schedule);
    if (blocks.length > 0) setScheduleBlocks(blocks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // Ground-truth check, once per Settings visit: profiles.push_enabled
  // defaults true and never self-corrects, so it can keep claiming push is
  // on long after iOS has silently dropped the real subscription. Only acts
  // on a confident `false` from OneSignal itself -- null (missing config,
  // network hiccup, anything ambiguous) is deliberately left alone, so a
  // flaky check can never wrongly flip a real, working subscription off.
  useEffect(() => {
    if (!profile?.push_enabled || getPushPermission() !== 'granted') return;
    let cancelled = false;
    void checkPushSubscription().then((subscribed) => {
      if (cancelled || subscribed !== false) return;
      setPushEnabled(false);
      setPushJustReset(true);
      void updateMyProfile(profile.id, { push_enabled: false });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  if (!profile) return null;

  async function saveProfile() {
    if (!profile) return;
    setProfileSaving(true);
    setProfileStatus(null);
    try {
      const blocks = scheduleBlocks.filter((b) => b.days.length > 0);
      await updateMyProfile(profile.id, {
        blurb: blurb.trim() || null,
        birthday: joinBirthday(birthMonth, birthDay),
        work_schedule: blocks.length > 0 ? { blocks } : null,
      });
      setProfileStatus('Profile saved.');
    } catch {
      setProfileStatus('Could not save — try again.');
    } finally {
      setProfileSaving(false);
    }
  }

  function toggleBlockDay(index: number, day: string) {
    setScheduleBlocks((prev) =>
      prev.map((b, i) =>
        i === index ? { ...b, days: b.days.includes(day) ? b.days.filter((d) => d !== day) : [...b.days, day] } : b,
      ),
    );
  }

  function updateBlockTime(index: number, field: 'start' | 'end', value: string) {
    setScheduleBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, [field]: value } : b)));
  }

  function addBlock() {
    setScheduleBlocks((prev) => [...prev, { ...BLANK_BLOCK }]);
  }

  function removeBlock(index: number) {
    setScheduleBlocks((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="font-serif text-2xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Preferences for {profile.full_name}.</p>

      <div className="mt-8 space-y-4">

        {/* My Profile */}
        <section className="rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4 shadow-card">
          <h2 className="mb-3 text-sm font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">My Profile</h2>
          <p className="mb-4 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
            Visible to all staff on the Team page. Your role description is set by Susanna.
          </p>

          {profile.role_description && (
            <div className="mb-4">
              <p className="field-label">Role</p>
              <p className="mt-1 rounded-lg bg-sparrow-mist dark:bg-sparrow-dark-surface2 px-3 py-2 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
                {profile.role_description}
              </p>
            </div>
          )}

          <div className="mb-4">
            <label className="field-label" htmlFor="blurb">About me</label>
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
            <label className="field-label" htmlFor="birthday-month">
              Birthday <span className="font-normal text-sparrow-gray dark:text-sparrow-dark-gray">(adds a yearly all-staff calendar event — no year needed)</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <select
                id="birthday-month"
                value={birthMonth}
                onChange={(e) => {
                  const m = e.target.value;
                  setBirthMonth(m);
                  const max = m ? DAYS_IN_MONTH[Number(m) - 1] : 31;
                  if (Number(birthDay) > max) setBirthDay('');
                }}
                className="field-input"
              >
                <option value="">Month</option>
                {MONTHS.map((name, i) => (
                  <option key={name} value={String(i + 1).padStart(2, '0')}>{name}</option>
                ))}
              </select>
              <select
                id="birthday-day"
                value={birthDay}
                onChange={(e) => setBirthDay(e.target.value)}
                className="field-input"
              >
                <option value="">Day</option>
                {Array.from({ length: birthMonth ? DAYS_IN_MONTH[Number(birthMonth) - 1] : 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={String(d).padStart(2, '0')}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-4">
            <p className="field-label">Typical working hours</p>
            <p className="mb-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
              Add a block for each chunk of time you typically work — split your day however it actually goes.
            </p>
            <div className="space-y-3">
              {scheduleBlocks.map((block, index) => (
                <div key={index} className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border p-3">
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_DAYS.map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleBlockDay(index, day)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                          block.days.includes(day)
                            ? 'bg-sparrow-green text-white'
                            : 'bg-sparrow-mist dark:bg-sparrow-dark-surface2 text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <label className="field-label" htmlFor={`sched-start-${index}`}>Start time</label>
                      <input
                        id={`sched-start-${index}`}
                        type="time"
                        value={block.start}
                        onChange={(e) => updateBlockTime(index, 'start', e.target.value)}
                        className="field-input min-w-0"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="field-label" htmlFor={`sched-end-${index}`}>End time</label>
                      <input
                        id={`sched-end-${index}`}
                        type="time"
                        value={block.end}
                        onChange={(e) => updateBlockTime(index, 'end', e.target.value)}
                        className="field-input min-w-0"
                      />
                    </div>
                  </div>
                  {scheduleBlocks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeBlock(index)}
                      className="mt-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-priority-p1"
                    >
                      Remove block
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={addBlock} className="btn-ghost mt-2 border border-sparrow-rule dark:border-sparrow-dark-border text-sm">
              + Add another block
            </button>
          </div>

          {profileStatus && (
            <p className={`mb-3 text-xs ${profileStatus.includes('Could not') ? 'text-priority-p1' : 'text-sparrow-green dark:text-sparrow-dark-green'}`}>
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

        {/* Push notifications */}
        <section className="rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4 shadow-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Push notifications</p>
              <p className="mt-0.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                {pushBlocked
                  ? 'Blocked in your browser — click the lock icon in your address bar to allow, then reload.'
                  : 'Alerts for new direct messages and announcements, even when the app isn\'t open.'}
              </p>
              <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                On iPhone, this only works reliably if you open Sparrow from the icon you added to your home
                screen — not from a browser tab or bookmark, even in Chrome (every browser on iPhone runs
                the same underlying engine).
              </p>
            </div>
            <button
              role="switch"
              aria-checked={pushEnabled && !pushBlocked}
              disabled={pushBlocked}
              onClick={async () => {
                const next = !pushEnabled;
                if (next && getPushPermission() !== 'granted') {
                  const granted = await requestPushPermission();
                  if (!granted) {
                    setPushBlocked(getPushPermission() === 'denied');
                    return;
                  }
                }
                setPushEnabled(next);
                setPushJustReset(false);
                try {
                  await updateMyProfile(profile!.id, { push_enabled: next });
                } catch {
                  // Save failed — revert instead of leaving the toggle showing a
                  // state that isn't actually saved (it would otherwise silently
                  // snap back later on the next background session refresh).
                  setPushEnabled(!next);
                }
              }}
              className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${
                pushEnabled && !pushBlocked ? 'bg-sparrow-green' : 'bg-sparrow-rule dark:bg-sparrow-dark-border'
              } ${pushBlocked ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  pushEnabled && !pushBlocked ? 'left-[1.375rem]' : 'left-0.5'
                }`}
              />
            </button>
          </div>
          {pushJustReset && (
            <p className="mt-3 rounded-lg bg-sparrow-cream dark:bg-sparrow-dark-surface2 px-3 py-2 text-xs text-sparrow-ink dark:text-sparrow-dark-ink">
              Push notifications had stopped actually working on this device, so we turned the setting back off
              rather than leave it showing on. Flip it back on any time.
            </p>
          )}
        </section>

        {/* Dark mode */}
        <section className="flex items-start justify-between gap-4 rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4 shadow-card">
          <div>
            <p className="text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Dark mode</p>
            <p className="mt-0.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
              Applies across the whole staff dashboard, just for you.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={darkMode}
            onClick={async () => {
              const next = !darkMode;
              setDarkMode(next);
              applyTheme(next);
              try {
                await updateMyProfile(profile!.id, { dark_mode: next });
              } catch {
                setDarkMode(!next);
                applyTheme(!next);
              }
            }}
            className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${
              darkMode ? 'bg-sparrow-green' : 'bg-sparrow-rule dark:bg-sparrow-dark-border'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                darkMode ? 'left-[1.375rem]' : 'left-0.5'
              }`}
            />
          </button>
        </section>
      </div>
    </div>
  );
}
