import { useEffect, useState, type ChangeEvent } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { updateMyProfile, uploadAvatarPhoto, normalizeSchedule } from '@/lib/team';
import { getPushPermission, requestPushPermission } from '@/lib/push';
import type { ScheduleBlock } from '@/lib/types';

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const BLANK_BLOCK: ScheduleBlock = { days: [], start: '09:00', end: '17:00' };

export function SettingsView() {
  const { profile } = useAuth();

  // Profile fields
  const [blurb, setBlurb] = useState('');
  const [scheduleBlocks, setScheduleBlocks] = useState<ScheduleBlock[]>([{ ...BLANK_BLOCK, days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] }]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [pushBlocked, setPushBlocked] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setPushEnabled(profile.push_enabled ?? true);
    setPushBlocked(getPushPermission() === 'denied');
    setBlurb(profile.blurb ?? '');
    setPhotoUrl(profile.photo_url);
    const blocks = normalizeSchedule(profile.work_schedule);
    if (blocks.length > 0) setScheduleBlocks(blocks);
  }, [profile]);

  if (!profile) return null;

  async function saveProfile() {
    if (!profile) return;
    setProfileSaving(true);
    setProfileStatus(null);
    try {
      const blocks = scheduleBlocks.filter((b) => b.days.length > 0);
      await updateMyProfile(profile.id, {
        blurb: blurb.trim() || null,
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

  async function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setPhotoUploading(true);
    setProfileStatus(null);
    try {
      const url = await uploadAvatarPhoto(profile.id, file);
      await updateMyProfile(profile.id, { photo_url: url });
      setPhotoUrl(url);
      setProfileStatus('Profile saved.');
    } catch {
      setProfileStatus('Could not upload photo — try again.');
    } finally {
      setPhotoUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="font-serif text-2xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-sparrow-gray">Preferences for {profile.full_name}.</p>

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
            <p className="field-label">Photo</p>
            <div className="mt-1 flex items-center gap-3">
              {photoUrl ? (
                <img src={photoUrl} alt={profile.full_name} className="h-14 w-14 rounded-full object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sparrow-mist text-sm text-sparrow-gray">
                  None
                </div>
              )}
              <label className="btn-ghost cursor-pointer border border-sparrow-rule text-sm">
                {photoUploading ? 'Uploading…' : photoUrl ? 'Change photo' : 'Upload photo'}
                <input type="file" accept="image/*" className="hidden" disabled={photoUploading} onChange={(e) => void handlePhotoChange(e)} />
              </label>
            </div>
          </div>

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
            <p className="field-label">Typical working hours</p>
            <p className="mb-2 text-xs text-sparrow-gray">
              Add a block for each chunk of time you typically work — split your day however it actually goes.
            </p>
            <div className="space-y-3">
              {scheduleBlocks.map((block, index) => (
                <div key={index} className="rounded-xl border border-sparrow-rule p-3">
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_DAYS.map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleBlockDay(index, day)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                          block.days.includes(day)
                            ? 'bg-sparrow-green text-white'
                            : 'bg-sparrow-mist text-sparrow-gray hover:text-sparrow-ink'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <div>
                      <label className="field-label" htmlFor={`sched-start-${index}`}>Start time</label>
                      <input
                        id={`sched-start-${index}`}
                        type="time"
                        value={block.start}
                        onChange={(e) => updateBlockTime(index, 'start', e.target.value)}
                        className="field-input"
                      />
                    </div>
                    <div>
                      <label className="field-label" htmlFor={`sched-end-${index}`}>End time</label>
                      <input
                        id={`sched-end-${index}`}
                        type="time"
                        value={block.end}
                        onChange={(e) => updateBlockTime(index, 'end', e.target.value)}
                        className="field-input"
                      />
                    </div>
                  </div>
                  {scheduleBlocks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeBlock(index)}
                      className="mt-2 text-xs text-sparrow-gray hover:text-priority-p1"
                    >
                      Remove block
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={addBlock} className="btn-ghost mt-2 border border-sparrow-rule text-sm">
              + Add another block
            </button>
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

        {/* Push notifications */}
        <section className="flex items-start justify-between gap-4 rounded-2xl border border-sparrow-rule bg-white p-4 shadow-card">
          <div>
            <p className="text-sm font-medium text-sparrow-ink">Push notifications</p>
            <p className="mt-0.5 text-xs text-sparrow-gray">
              {pushBlocked
                ? 'Blocked in your browser — click the lock icon in your address bar to allow, then reload.'
                : 'Alerts for new direct messages and announcements, even when the app isn\'t open.'}
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
              await updateMyProfile(profile!.id, { push_enabled: next });
            }}
            className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${
              pushEnabled && !pushBlocked ? 'bg-sparrow-green' : 'bg-sparrow-rule'
            } ${pushBlocked ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                pushEnabled && !pushBlocked ? 'left-[1.375rem]' : 'left-0.5'
              }`}
            />
          </button>
        </section>
      </div>
    </div>
  );
}
