import { useEffect, useState } from 'react';
import { useRequiredFields } from '@/hooks/useRequiredFields';
import type { Profile } from '@/lib/types';
import { localDate } from '@/lib/date';
import { Drawer } from '../lcp/Drawer';
import {
  addConnectionNote,
  fetchConnectionNotes,
  updateConnection,
  type ConnectionInput,
  type ConnectionNote,
  type PartnershipConnection,
  type PartnershipEvent,
} from '@/lib/partnerships-tabs';
import { BusinessCardPhotos } from './BusinessCardPhotos';

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

type EditableFields = Omit<ConnectionInput, 'event_id'> & { event_id: string | null };

// Read-only expanded view by default (Discussed/Next action are truncated in the table row
// — this is where you actually read them in full), Edit switches to editable fields.
export function ConnectionDetailPanel({
  open,
  connection,
  events,
  profiles,
  currentUserId,
  onClose,
  onChanged,
}: {
  open: boolean;
  connection: PartnershipConnection | null;
  events: PartnershipEvent[];
  profiles: Profile[];
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditableFields | null>(null);
  const [busy, setBusy] = useState(false);

  const [notes, setNotes] = useState<ConnectionNote[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [noteDate, setNoteDate] = useState('');
  const [noteText, setNoteText] = useState('');
  const [logBusy, setLogBusy] = useState(false);

  const { fieldClass, fieldError, clear, validate } = useRequiredFields([
    { key: 'cdp-name', label: 'Name', valid: (form?.name.trim().length ?? 0) > 0 },
  ]);

  const {
    fieldClass: noteFieldClass,
    fieldError: noteFieldError,
    clear: clearNoteField,
    validate: validateNote,
  } = useRequiredFields([
    { key: 'cdp-note-text', label: 'Note', valid: noteText.trim().length > 0 },
  ]);

  const ownerProfiles = profiles.filter(
    (p) => (p.department === 'partnerships' || p.partnerships_access) && p.department !== 'exec',
  );

  useEffect(() => {
    if (open && connection) {
      setEditing(false);
      setForm({
        event_id: connection.event_id,
        name: connection.name,
        organization: connection.organization,
        what_discussed: connection.what_discussed,
        next_action: connection.next_action,
        followup_due: connection.followup_due,
        owner_id: connection.owner_id,
      });
      setLogOpen(false);
      setNoteDate(localDate());
      setNoteText('');
      void fetchConnectionNotes(connection.id).then(setNotes).catch(() => setNotes([]));
    }
  }, [open, connection]);

  async function logInteraction() {
    if (!connection || !validateNote()) return;
    setLogBusy(true);
    try {
      await addConnectionNote(connection.id, noteDate, noteText.trim(), currentUserId);
      setNotes(await fetchConnectionNotes(connection.id));
      setNoteText('');
      setLogOpen(false);
    } finally {
      setLogBusy(false);
    }
  }

  if (!connection || !form) return null;

  const eventName = connection.event_id
    ? events.find((e) => e.id === connection.event_id)?.event_name ?? '—'
    : '—';

  async function save() {
    if (!connection || !form) return;
    if (!validate()) return;
    setBusy(true);
    try {
      await updateConnection(connection.id, form);
      setEditing(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={connection.name}
      subtitle={connection.organization ?? undefined}
      footer={
        editing ? (
          <div className="flex gap-2">
            <button onClick={() => void save()} disabled={busy} className="btn-primary flex-1">
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setForm({
                  event_id: connection.event_id,
                  name: connection.name,
                  organization: connection.organization,
                  what_discussed: connection.what_discussed,
                  next_action: connection.next_action,
                  followup_due: connection.followup_due,
                  owner_id: connection.owner_id,
                });
              }}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="btn-primary w-full">
            Edit
          </button>
        )
      }
    >
      {!editing ? (
        <div className="space-y-4">
          <div>
            <p className="field-label">Organization</p>
            <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">{connection.organization ?? '—'}</p>
          </div>
          <div>
            <p className="field-label">What was discussed</p>
            <p className="whitespace-pre-wrap text-sm text-sparrow-ink dark:text-sparrow-dark-ink">{connection.what_discussed ?? '—'}</p>
          </div>
          <div>
            <p className="field-label">Next action</p>
            <p className="whitespace-pre-wrap text-sm text-sparrow-ink dark:text-sparrow-dark-ink">{connection.next_action ?? '—'}</p>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <p className="field-label">Other interactions</p>
              <button onClick={() => setLogOpen((v) => !v)} className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green">
                {logOpen ? 'Cancel' : '+ Log another interaction'}
              </button>
            </div>
            {logOpen && (
              <div className="mt-2 space-y-2 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-3">
                <input
                  type="date"
                  value={noteDate}
                  onChange={(e) => setNoteDate(e.target.value)}
                  className="field-input"
                />
                <textarea
                  value={noteText}
                  onChange={(e) => { setNoteText(e.target.value); clearNoteField('cdp-note-text'); }}
                  rows={2}
                  placeholder="What happened this time…"
                  className={noteFieldClass('cdp-note-text', 'field-input')}
                />
                {noteFieldError('cdp-note-text') && <p className="text-xs text-priority-p1">{noteFieldError('cdp-note-text')}</p>}
                <button onClick={() => void logInteraction()} disabled={logBusy} className="btn-primary text-xs">
                  {logBusy ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
            {notes.length > 0 && (
              <ul className="mt-2 space-y-2">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-lg bg-sparrow-mist/60 dark:bg-sparrow-dark-surface2 p-2">
                    <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{shortDate(n.occurred_on)}</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-sparrow-ink dark:text-sparrow-dark-ink">{n.note}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="field-label">Follow-up due</p>
            <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">{shortDate(connection.followup_due)}</p>
          </div>
          <div>
            <p className="field-label">Owner</p>
            <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
              {ownerProfiles.find((p) => p.id === connection.owner_id)?.full_name ?? 'Unassigned'}
            </p>
          </div>
          <div>
            <p className="field-label">Linked event</p>
            <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">{eventName}</p>
          </div>
          <BusinessCardPhotos
            table="partnership_connections"
            recordId={connection.id}
            frontPath={connection.business_card_front_path}
            backPath={connection.business_card_back_path}
            onChanged={onChanged}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="field-label field-label-required" htmlFor="cdp-name">Name</label>
            <input
              id="cdp-name"
              className={fieldClass('cdp-name', 'field-input w-full')}
              value={form.name}
              onChange={(e) => { setForm((f) => f && { ...f, name: e.target.value }); clear('cdp-name'); }}
            />
            {fieldError('cdp-name') && <p className="mt-1 text-xs text-priority-p1">{fieldError('cdp-name')}</p>}
          </div>
          <div>
            <label className="field-label">Organization</label>
            <input
              className="field-input w-full"
              value={form.organization ?? ''}
              onChange={(e) => setForm((f) => f && { ...f, organization: e.target.value || null })}
            />
          </div>
          <div>
            <label className="field-label">What was discussed</label>
            <textarea
              rows={3}
              className="field-input w-full"
              value={form.what_discussed ?? ''}
              onChange={(e) => setForm((f) => f && { ...f, what_discussed: e.target.value || null })}
            />
          </div>
          <div>
            <label className="field-label">Next action</label>
            <textarea
              rows={2}
              className="field-input w-full"
              value={form.next_action ?? ''}
              onChange={(e) => setForm((f) => f && { ...f, next_action: e.target.value || null })}
            />
          </div>
          <div>
            <label className="field-label">Follow-up due</label>
            <input
              type="date"
              className="field-input w-full"
              value={form.followup_due ?? ''}
              onChange={(e) => setForm((f) => f && { ...f, followup_due: e.target.value || null })}
            />
          </div>
          <div>
            <label className="field-label">Owner</label>
            <select
              className="field-input w-full"
              value={form.owner_id ?? ''}
              onChange={(e) => setForm((f) => f && { ...f, owner_id: e.target.value || null })}
            >
              <option value="">Unassigned</option>
              {ownerProfiles.map((op) => (
                <option key={op.id} value={op.id}>{op.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Linked event</label>
            <select
              className="field-input w-full"
              value={form.event_id ?? ''}
              onChange={(e) => setForm((f) => f && { ...f, event_id: e.target.value || null })}
            >
              <option value="">— No event —</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>{shortDate(ev.event_date)} · {ev.event_name}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </Drawer>
  );
}
