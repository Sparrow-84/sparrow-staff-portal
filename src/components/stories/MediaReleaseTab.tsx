import { useState, useTransition } from 'react';
import {
  createLayer2Consent,
  createMediaEvent,
  type ChildrenPhotoConsent,
  type StoryLayer2Consent,
  type StoryMediaEvent,
} from '@/lib/stories';

const CHILDREN_CONSENT_LABEL: Record<ChildrenPhotoConsent, string> = {
  'n/a': 'No children in program',
  yes: 'Yes, consented',
  no: 'No, declined',
};

interface Props {
  events: StoryMediaEvent[];
  consents: StoryLayer2Consent[];
  currentUserId: string;
  onChanged: () => void;
}

export function MediaReleaseTab({ events, consents, currentUserId, onChanged }: Props) {
  // Layer 1 inline form state
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [sandwichBoard, setSandwichBoard] = useState(true);
  const [eventNotes, setEventNotes] = useState('');
  const [eventPending, startEventTransition] = useTransition();
  const [eventError, setEventError] = useState<string | null>(null);

  // Layer 2 inline form state
  const [showConsentForm, setShowConsentForm] = useState(false);
  const [participantName, setParticipantName] = useState('');
  const [photoConsent, setPhotoConsent] = useState(false);
  const [dateSigned, setDateSigned] = useState('');
  const [childrenPhotoConsent, setChildrenPhotoConsent] = useState<ChildrenPhotoConsent>('n/a');
  const [consentNotes, setConsentNotes] = useState('');
  const [consentPending, startConsentTransition] = useTransition();
  const [consentError, setConsentError] = useState<string | null>(null);

  function resetEventForm() {
    setEventName('');
    setEventDate('');
    setSandwichBoard(true);
    setEventNotes('');
    setEventError(null);
    setShowEventForm(false);
  }

  function resetConsentForm() {
    setParticipantName('');
    setPhotoConsent(false);
    setDateSigned('');
    setChildrenPhotoConsent('n/a');
    setConsentNotes('');
    setConsentError(null);
    setShowConsentForm(false);
  }

  function saveEvent() {
    if (!eventName.trim() || !eventDate) {
      setEventError('Event name and date are required.');
      return;
    }
    startEventTransition(async () => {
      try {
        await createMediaEvent({
          event_name: eventName.trim(),
          event_date: eventDate,
          sandwich_board_posted: sandwichBoard,
          notes: eventNotes.trim() || null,
          logged_by: currentUserId,
        });
        onChanged();
        resetEventForm();
      } catch (e) {
        setEventError(e instanceof Error ? e.message : 'Could not save.');
      }
    });
  }

  function saveConsent() {
    if (!participantName.trim()) {
      setConsentError('Participant name is required.');
      return;
    }
    startConsentTransition(async () => {
      try {
        await createLayer2Consent({
          participant_name: participantName.trim(),
          photo_consent: photoConsent,
          date_signed: dateSigned || null,
          children_photo_consent: childrenPhotoConsent,
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

  function formatDate(d: string) {
    return new Date(d + 'T12:00:00').toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  return (
    <div className="space-y-8">
      {/* Rules box — all 3 layers */}
      <div className="rounded-xl border border-sparrow-gold/30 bg-sparrow-cream px-4 py-3 text-sm">
        <p className="font-semibold text-sparrow-ink">Three-layer photo release framework</p>
        <ul className="mt-2 space-y-1.5 text-sparrow-gray">
          <li>
            <span className="font-medium text-sparrow-ink">Layer 1 — Community event</span> — A
            sandwich board at every community event lets attendees know photos may be taken.
            Documented here.
          </li>
          <li>
            <span className="font-medium text-sparrow-ink">Layer 2 — Participant photo form</span> —
            Everyone signs the release, but the photo/video sections (participant and children) are
            separate optional checkboxes — a signed form does not by itself mean photos are allowed.
            Documented here.
          </li>
          <li>
            <span className="font-medium text-sparrow-ink">Layer 3 — Story-level verbal consent</span> —
            Before a photo is published next to a specific story, staff ask the participant directly.
            Tracked on each story record (Stories tab).
          </li>
        </ul>
      </div>

      {/* ── Layer 1: Community Event Log ───────────────────────────── */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sparrow-ink">Layer 1 — Community event log</h2>
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
          <div className="mt-3 rounded-xl border border-sparrow-rule bg-white px-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label" htmlFor="mr-event-name">
                  Event name
                </label>
                <input
                  id="mr-event-name"
                  className="field-input"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  placeholder="e.g. Monthly Community Dinner"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="mr-event-date">
                  Date
                </label>
                <input
                  id="mr-event-date"
                  type="date"
                  className="field-input"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
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
                Notes <span className="font-normal text-sparrow-gray">(optional)</span>
              </label>
              <input
                id="mr-event-notes"
                className="field-input"
                value={eventNotes}
                onChange={(e) => setEventNotes(e.target.value)}
                placeholder="Any additional context…"
              />
            </div>
            {eventError && <p className="mt-2 text-sm text-priority-p1">{eventError}</p>}
            <div className="mt-3 flex items-center justify-end gap-2">
              <button onClick={resetEventForm} className="btn-ghost">
                Cancel
              </button>
              <button onClick={saveEvent} disabled={eventPending} className="btn-primary">
                {eventPending ? 'Saving…' : 'Save event'}
              </button>
            </div>
          </div>
        )}

        {events.length === 0 ? (
          <p className="mt-3 text-sm text-sparrow-gray">No events logged yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-sparrow-rule">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sparrow-rule bg-sparrow-mist/40">
                  <th className="px-4 py-2 text-left font-semibold text-sparrow-gray">Event</th>
                  <th className="px-4 py-2 text-left font-semibold text-sparrow-gray">Date</th>
                  <th className="px-4 py-2 text-center font-semibold text-sparrow-gray">Board posted</th>
                  <th className="px-4 py-2 text-left font-semibold text-sparrow-gray">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sparrow-rule bg-white">
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td className="px-4 py-2.5 font-medium text-sparrow-ink">{ev.event_name}</td>
                    <td className="px-4 py-2.5 text-sparrow-gray">{formatDate(ev.event_date)}</td>
                    <td className="px-4 py-2.5 text-center">
                      {ev.sandwich_board_posted ? (
                        <span className="text-sparrow-green">✓</span>
                      ) : (
                        <span className="text-priority-p1">✗</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-sparrow-gray">{ev.notes ?? '—'}</td>
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
          <h2 className="font-semibold text-sparrow-ink">Layer 2 — Participant photo forms</h2>
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
          <div className="mt-3 rounded-xl border border-sparrow-rule bg-white px-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label" htmlFor="mr-p-name">
                  Participant name
                </label>
                <input
                  id="mr-p-name"
                  className="field-input"
                  value={participantName}
                  onChange={(e) => setParticipantName(e.target.value)}
                  placeholder="First name or initials"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="mr-p-date">
                  Date signed <span className="font-normal text-sparrow-gray">(if signed)</span>
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
                <label className="field-label" htmlFor="mr-p-photo">
                  Photos/video of participant <span className="font-normal text-sparrow-gray">(Section 2 of the form)</span>
                </label>
                <select
                  id="mr-p-photo"
                  className="field-input"
                  value={photoConsent ? 'yes' : 'no'}
                  onChange={(e) => setPhotoConsent(e.target.value === 'yes')}
                >
                  <option value="no">No, declined</option>
                  <option value="yes">Yes, consented</option>
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="mr-p-children-photo">
                  Photos/video of children <span className="font-normal text-sparrow-gray">(Section 3)</span>
                </label>
                <select
                  id="mr-p-children-photo"
                  className="field-input"
                  value={childrenPhotoConsent}
                  onChange={(e) => setChildrenPhotoConsent(e.target.value as ChildrenPhotoConsent)}
                >
                  {(Object.entries(CHILDREN_CONSENT_LABEL) as [ChildrenPhotoConsent, string][]).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="mt-2 text-xs text-sparrow-gray">
              Signing the release form is separate from consenting to photos — Sections 2 and 3 are optional
              checkboxes on the form, so a signed form can still have either left unchecked. Log exactly what
              the form says, not whether it was signed.
            </p>
            <div className="mt-3">
              <label className="field-label" htmlFor="mr-p-notes">
                Notes <span className="font-normal text-sparrow-gray">(optional)</span>
              </label>
              <input
                id="mr-p-notes"
                className="field-input"
                value={consentNotes}
                onChange={(e) => setConsentNotes(e.target.value)}
                placeholder="Any additional context…"
              />
            </div>
            {consentError && <p className="mt-2 text-sm text-priority-p1">{consentError}</p>}
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
          <p className="mt-3 text-sm text-sparrow-gray">No photo consent forms on record yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-sparrow-rule">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sparrow-rule bg-sparrow-mist/40">
                  <th className="px-4 py-2 text-left font-semibold text-sparrow-gray">Participant</th>
                  <th className="px-4 py-2 text-left font-semibold text-sparrow-gray">Date signed</th>
                  <th className="px-4 py-2 text-center font-semibold text-sparrow-gray">Photos — participant</th>
                  <th className="px-4 py-2 text-center font-semibold text-sparrow-gray">Photos — children</th>
                  <th className="px-4 py-2 text-left font-semibold text-sparrow-gray">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sparrow-rule bg-white">
                {consents.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5 font-medium text-sparrow-ink">{c.participant_name}</td>
                    <td className="px-4 py-2.5 text-sparrow-gray">
                      {c.date_signed ? formatDate(c.date_signed) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {c.photo_consent ? (
                        <span className="font-medium text-sparrow-green">Yes</span>
                      ) : (
                        <span className="font-medium text-priority-p1">No</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {c.children_photo_consent === 'yes' ? (
                        <span className="font-medium text-sparrow-green">Yes</span>
                      ) : c.children_photo_consent === 'no' ? (
                        <span className="font-medium text-priority-p1">No</span>
                      ) : (
                        <span className="text-sparrow-gray">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-sparrow-gray">{c.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Layer 3 note */}
      <div className="rounded-xl border border-sparrow-rule bg-sparrow-mist/30 px-4 py-3 text-sm text-sparrow-gray">
        <span className="font-medium text-sparrow-ink">Layer 3 — Story-level verbal consent</span> is
        tracked on each story record. Open the Stories tab, click a story, and scroll to the Photo
        consent section to update it.
      </div>
    </div>
  );
}
