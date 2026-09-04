import { useState, useTransition } from 'react';
import {
  createLayer2Consent,
  createMediaEvent,
  deleteMediaEvent,
  linkLayer2ConsentToParticipant,
  updateMediaEvent,
  type NamingChoice,
  type StoryLayer2Consent,
  type StoryMediaEvent,
  type StoryParticipant,
} from '@/lib/stories';
import { useRequiredFields } from '@/hooks/useRequiredFields';
import { ParticipantPicker } from './ParticipantPicker';

interface Props {
  events: StoryMediaEvent[];
  consents: StoryLayer2Consent[];
  participants: StoryParticipant[];
  currentUserId: string;
  onChanged: () => void;
}

export function MediaReleaseTab({ events, consents, participants, currentUserId, onChanged }: Props) {
  // Layer 1 inline form state
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [sandwichBoard, setSandwichBoard] = useState(true);
  const [eventNotes, setEventNotes] = useState('');
  const [eventPending, startEventTransition] = useTransition();
  const [eventError, setEventError] = useState<string | null>(null);
  const {
    missingMessage: eventMissingMessage,
    validate: validateEvent,
    fieldClass: eventFieldClass,
    fieldError: eventFieldError,
    clear: clearEvent,
    reset: resetEventValidation,
  } = useRequiredFields([
    { key: 'mr-event-name', label: 'Event name', valid: eventName.trim().length > 0 },
    { key: 'mr-event-date', label: 'Date', valid: !!eventDate },
  ]);

  // Layer 2 inline form state
  const [showConsentForm, setShowConsentForm] = useState(false);
  const [consentAdultId, setConsentAdultId] = useState<string | null>(null);
  const [namingChoice, setNamingChoice] = useState<NamingChoice>('anonymous');
  const [faceObscured, setFaceObscured] = useState(false);
  const [childrenFaceObscured, setChildrenFaceObscured] = useState(false);
  const [dateSigned, setDateSigned] = useState('');
  const [consentNotes, setConsentNotes] = useState('');
  const [consentPending, startConsentTransition] = useTransition();
  const [consentError, setConsentError] = useState<string | null>(null);
  const {
    missingMessage: consentMissingMessage,
    validate: validateConsent,
    fieldError: consentFieldError,
    clear: clearConsent,
    reset: resetConsentValidation,
  } = useRequiredFields([
    { key: 'mr-p-adult', label: 'Participant', valid: !!consentAdultId },
  ]);

  // Inline "link to a participant" state for legacy rows with no household_adult_id yet.
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [linkPending, startLinkTransition] = useTransition();
  const [linkError, setLinkError] = useState<string | null>(null);

  function resetEventForm() {
    setEventName('');
    setEventDate('');
    setSandwichBoard(true);
    setEventNotes('');
    setEventError(null);
    resetEventValidation();
    setShowEventForm(false);
    setEditingEventId(null);
  }

  function startEditEvent(ev: StoryMediaEvent) {
    setEditingEventId(ev.id);
    setEventName(ev.event_name);
    setEventDate(ev.event_date);
    setSandwichBoard(ev.sandwich_board_posted);
    setEventNotes(ev.notes ?? '');
    setEventError(null);
    setShowEventForm(true);
  }

  function resetConsentForm() {
    setConsentAdultId(null);
    setNamingChoice('anonymous');
    setFaceObscured(false);
    setChildrenFaceObscured(false);
    setDateSigned('');
    setConsentNotes('');
    setConsentError(null);
    resetConsentValidation();
    setShowConsentForm(false);
  }

  function saveEvent() {
    if (!validateEvent()) return;
    startEventTransition(async () => {
      try {
        if (editingEventId) {
          await updateMediaEvent(editingEventId, {
            event_name: eventName.trim(),
            event_date: eventDate,
            sandwich_board_posted: sandwichBoard,
            notes: eventNotes.trim() || null,
          });
        } else {
          await createMediaEvent({
            event_name: eventName.trim(),
            event_date: eventDate,
            sandwich_board_posted: sandwichBoard,
            notes: eventNotes.trim() || null,
            logged_by: currentUserId,
          });
        }
        onChanged();
        resetEventForm();
      } catch (e) {
        setEventError(e instanceof Error ? e.message : 'Could not save.');
      }
    });
  }

  function deleteEvent(ev: StoryMediaEvent) {
    if (!window.confirm(`Delete the "${ev.event_name}" event log entry? This can't be undone.`)) return;
    startEventTransition(async () => {
      try {
        await deleteMediaEvent(ev.id);
        onChanged();
      } catch (e) {
        setEventError(e instanceof Error ? e.message : 'Could not delete.');
      }
    });
  }

  function saveConsent() {
    if (!validateConsent() || !consentAdultId) return;
    const participant = participants.find((p) => p.adult_id === consentAdultId);
    startConsentTransition(async () => {
      try {
        await createLayer2Consent({
          household_adult_id: consentAdultId,
          participant_name: participant?.full_name ?? '',
          naming_choice: namingChoice,
          face_obscured: faceObscured,
          children_face_obscured: childrenFaceObscured,
          date_signed: dateSigned || null,
          notes: consentNotes.trim() || null,
          logged_by: currentUserId,
        });
        onChanged();
        resetConsentForm();
      } catch (e) {
        setConsentError(e instanceof Error ? e.message : 'Could not save.');
      }
    });
  }

  function linkConsent(id: string, adultId: string | null) {
    if (!adultId) return;
    setLinkingId(id);
    setLinkError(null);
    startLinkTransition(async () => {
      try {
        await linkLayer2ConsentToParticipant(id, adultId);
        onChanged();
        setLinkingId(null);
      } catch (e) {
        setLinkError(e instanceof Error ? e.message : 'Could not link.');
      }
    });
  }

  function formatDate(d: string) {
    return new Date(d + 'T12:00:00').toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  function namingCell(c: StoryLayer2Consent) {
    if (c.naming_choice) {
      return c.naming_choice === 'named' ? 'Named' : 'Anonymous';
    }
    if (c.photo_consent !== null) {
      // Legacy entry, signed under a prior version of the form that didn't ask this question.
      return <span className="text-sparrow-gray dark:text-sparrow-dark-gray">— (prior form)</span>;
    }
    return <span className="text-sparrow-gray dark:text-sparrow-dark-gray">—</span>;
  }

  function faceCell(obscured: boolean | null, legacyConsent: boolean | null, legacyLabel: string) {
    if (obscured !== null) {
      return obscured ? 'Blurred' : 'Not blurred';
    }
    if (legacyConsent !== null) {
      return (
        <span className="text-sparrow-gray dark:text-sparrow-dark-gray">
          {legacyConsent ? `${legacyLabel} consented (prior form)` : `${legacyLabel} declined (prior form)`}
        </span>
      );
    }
    return <span className="text-sparrow-gray dark:text-sparrow-dark-gray">—</span>;
  }

  return (
    <div className="space-y-8">
      {/* Rules box — all 3 layers */}
      <div className="rounded-xl border border-sparrow-gold/30 bg-sparrow-cream dark:bg-sparrow-dark-surface2 px-4 py-3 text-sm">
        <p className="font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">Three-layer photo release framework</p>
        <ul className="mt-2 space-y-1.5 text-sparrow-gray dark:text-sparrow-dark-gray">
          <li>
            <span className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Layer 1 — Community event</span> — A
            sandwich board at every community event lets attendees know photos may be taken.
            Documented here.
          </li>
          <li>
            <span className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Layer 2 — Participant photo form</span> —
            Story, photos &amp; video are a required part of joining LifeChange. The real choices on file
            here are Named vs. Anonymous, and whether her face (and separately, her kids' faces) should
            be blurred. Documented here.
          </li>
          <li>
            <span className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Layer 3 — Story-level verbal consent</span> —
            Before a photo is published next to a specific story, staff ask the participant directly.
            Tracked on each story record (Stories tab).
          </li>
        </ul>
      </div>

      {/* ── Layer 1: Community Event Log ───────────────────────────── */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">Layer 1 — Community event log</h2>
          {!showEventForm && (
            <button
              onClick={() => setShowEventForm(true)}
              className="btn-primary"
            >
              + Log an event
            </button>
          )}
        </div>

        {showEventForm && (
          <div className="mt-3 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface px-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label field-label-required" htmlFor="mr-event-name">
                  Event name
                </label>
                <input
                  id="mr-event-name"
                  className={eventFieldClass('mr-event-name')}
                  value={eventName}
                  onChange={(e) => { setEventName(e.target.value); clearEvent('mr-event-name'); }}
                  placeholder="e.g. Monthly Community Dinner"
                />
                {eventFieldError('mr-event-name') && <p className="mt-1 text-xs text-priority-p1">{eventFieldError('mr-event-name')}</p>}
              </div>
              <div>
                <label className="field-label field-label-required" htmlFor="mr-event-date">
                  Date
                </label>
                <input
                  id="mr-event-date"
                  type="date"
                  className={eventFieldClass('mr-event-date')}
                  value={eventDate}
                  onChange={(e) => { setEventDate(e.target.value); clearEvent('mr-event-date'); }}
                />
                {eventFieldError('mr-event-date') && <p className="mt-1 text-xs text-priority-p1">{eventFieldError('mr-event-date')}</p>}
              </div>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sandwichBoard}
                onChange={(e) => setSandwichBoard(e.target.checked)}
                className="h-4 w-4 accent-sparrow-green"
              />
              Sandwich board was posted at this event
            </label>
            <div className="mt-3">
              <label className="field-label" htmlFor="mr-event-notes">
                Notes <span className="font-normal text-sparrow-gray dark:text-sparrow-dark-gray">(optional)</span>
              </label>
              <input
                id="mr-event-notes"
                className="field-input"
                value={eventNotes}
                onChange={(e) => setEventNotes(e.target.value)}
                placeholder="Any additional context…"
              />
            </div>
            {(eventError || eventMissingMessage) && (
              <p className="mt-2 text-sm text-priority-p1">{eventError ?? eventMissingMessage}</p>
            )}
            <div className="mt-3 flex items-center justify-end gap-2">
              <button onClick={resetEventForm} className="btn-ghost">
                Cancel
              </button>
              <button onClick={saveEvent} disabled={eventPending} className="btn-primary">
                {eventPending ? 'Saving…' : editingEventId ? 'Save changes' : 'Save event'}
              </button>
            </div>
          </div>
        )}

        {events.length === 0 ? (
          <p className="mt-3 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No events logged yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-sparrow-green dark:bg-sparrow-dark-green">
                  <th className="px-4 py-2 text-left font-semibold text-white/90">Event</th>
                  <th className="px-4 py-2 text-left font-semibold text-white/90">Date</th>
                  <th className="px-4 py-2 text-center font-semibold text-white/90">Board posted</th>
                  <th className="px-4 py-2 text-left font-semibold text-white/90">Notes</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sparrow-rule dark:divide-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface">
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td className="px-4 py-2.5 font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{ev.event_name}</td>
                    <td className="px-4 py-2.5 text-sparrow-gray dark:text-sparrow-dark-gray">{formatDate(ev.event_date)}</td>
                    <td className="px-4 py-2.5 text-center">
                      {ev.sandwich_board_posted ? (
                        <span className="text-sparrow-green dark:text-sparrow-dark-green">✓</span>
                      ) : (
                        <span className="text-priority-p1">✗</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-sparrow-gray dark:text-sparrow-dark-gray">{ev.notes ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => startEditEvent(ev)}
                        className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteEvent(ev)}
                        className="ml-3 text-xs font-medium text-priority-p1 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Layer 2: Participant Photo Forms ───────────────────────── */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">Layer 2 — Participant photo forms</h2>
          {!showConsentForm && (
            <button
              onClick={() => setShowConsentForm(true)}
              className="btn-primary"
            >
              + Add entry
            </button>
          )}
        </div>

        {showConsentForm && (
          <div className="mt-3 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface px-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label field-label-required" htmlFor="mr-p-adult">
                  Participant
                </label>
                <ParticipantPicker
                  id="mr-p-adult"
                  participants={participants}
                  value={consentAdultId}
                  onChange={(id) => { setConsentAdultId(id); clearConsent('mr-p-adult'); }}
                />
                {consentFieldError('mr-p-adult') && <p className="mt-1 text-xs text-priority-p1">{consentFieldError('mr-p-adult')}</p>}
              </div>
              <div>
                <label className="field-label" htmlFor="mr-p-date">
                  Date signed <span className="font-normal text-sparrow-gray dark:text-sparrow-dark-gray">(if signed)</span>
                </label>
                <input
                  id="mr-p-date"
                  type="date"
                  className="field-input"
                  value={dateSigned}
                  onChange={(e) => setDateSigned(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="field-label" htmlFor="mr-p-naming">
                  Named or Anonymous <span className="font-normal text-sparrow-gray dark:text-sparrow-dark-gray">(Section 1)</span>
                </label>
                <select
                  id="mr-p-naming"
                  className="field-input"
                  value={namingChoice}
                  onChange={(e) => setNamingChoice(e.target.value as NamingChoice)}
                >
                  <option value="anonymous">Anonymous (default) — pseudonym used</option>
                  <option value="named">Named — real first name used</option>
                </select>
              </div>
              <div />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="field-label" htmlFor="mr-p-face">
                  Her face in photos/video <span className="font-normal text-sparrow-gray dark:text-sparrow-dark-gray">(Section 2)</span>
                </label>
                <select
                  id="mr-p-face"
                  className="field-input"
                  value={faceObscured ? 'obscured' : 'unobscured'}
                  onChange={(e) => setFaceObscured(e.target.value === 'obscured')}
                >
                  <option value="unobscured">Seen clearly (default)</option>
                  <option value="obscured">Blurred / covered</option>
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="mr-p-children-face">
                  Her kids' faces in photos/video <span className="font-normal text-sparrow-gray dark:text-sparrow-dark-gray">(Section 2)</span>
                </label>
                <select
                  id="mr-p-children-face"
                  className="field-input"
                  value={childrenFaceObscured ? 'obscured' : 'unobscured'}
                  onChange={(e) => setChildrenFaceObscured(e.target.value === 'obscured')}
                >
                  <option value="unobscured">Seen clearly (default)</option>
                  <option value="obscured">Blurred / covered</option>
                </select>
              </div>
            </div>
            <p className="mt-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
              Story, photos &amp; video sharing is a required part of joining LifeChange — the only real
              choices on the current form are Named vs. Anonymous and whether faces are blurred. Log
              exactly what she chose.
            </p>
            <div className="mt-3">
              <label className="field-label" htmlFor="mr-p-notes">
                Notes <span className="font-normal text-sparrow-gray dark:text-sparrow-dark-gray">(optional)</span>
              </label>
              <input
                id="mr-p-notes"
                className="field-input"
                value={consentNotes}
                onChange={(e) => setConsentNotes(e.target.value)}
                placeholder="Any additional context…"
              />
            </div>
            {(consentError || consentMissingMessage) && (
              <p className="mt-2 text-sm text-priority-p1">{consentError ?? consentMissingMessage}</p>
            )}
            <div className="mt-3 flex items-center justify-end gap-2">
              <button onClick={resetConsentForm} className="btn-ghost">
                Cancel
              </button>
              <button onClick={saveConsent} disabled={consentPending} className="btn-primary">
                {consentPending ? 'Saving…' : 'Save entry'}
              </button>
            </div>
          </div>
        )}

        {consents.length === 0 ? (
          <p className="mt-3 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No photo consent forms on record yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-sparrow-green dark:bg-sparrow-dark-green">
                  <th className="px-4 py-2 text-left font-semibold text-white/90">Participant</th>
                  <th className="px-4 py-2 text-left font-semibold text-white/90">Date signed</th>
                  <th className="px-4 py-2 text-left font-semibold text-white/90">Named/Anonymous</th>
                  <th className="px-4 py-2 text-left font-semibold text-white/90">Her face</th>
                  <th className="px-4 py-2 text-left font-semibold text-white/90">Kids' faces</th>
                  <th className="px-4 py-2 text-left font-semibold text-white/90">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sparrow-rule dark:divide-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface">
                {consents.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5 font-medium text-sparrow-ink dark:text-sparrow-dark-ink">
                      {c.household_adult_id ? (
                        c.participant_name
                      ) : linkingId === c.id ? (
                        <ParticipantPicker
                          participants={participants}
                          value={null}
                          onChange={(id) => linkConsent(c.id, id)}
                        />
                      ) : (
                        <button
                          onClick={() => setLinkingId(c.id)}
                          className="text-xs font-medium text-priority-p1 hover:underline"
                          title={c.participant_name}
                        >
                          {c.participant_name} — link to a participant
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-sparrow-gray dark:text-sparrow-dark-gray">
                      {c.date_signed ? formatDate(c.date_signed) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-sparrow-ink dark:text-sparrow-dark-ink">{namingCell(c)}</td>
                    <td className="px-4 py-2.5 text-sparrow-ink dark:text-sparrow-dark-ink">
                      {faceCell(c.face_obscured, c.photo_consent, 'Photos')}
                    </td>
                    <td className="px-4 py-2.5 text-sparrow-ink dark:text-sparrow-dark-ink">
                      {faceCell(
                        c.children_face_obscured,
                        c.children_photo_consent === 'n/a' ? null : c.children_photo_consent === 'yes',
                        'Kids’ photos',
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-sparrow-gray dark:text-sparrow-dark-gray">{c.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {linkPending && <p className="px-4 py-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Linking…</p>}
            {linkError && <p className="px-4 py-2 text-xs text-priority-p1">{linkError}</p>}
          </div>
        )}
      </section>

      {/* Layer 3 note */}
      <div className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist/30 px-4 py-3 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
        <span className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Layer 3 — Story-level verbal consent</span> is
        tracked on each story record. Open the Stories tab, click a story, and scroll to the Photo
        consent section to update it.
      </div>
    </div>
  );
}
