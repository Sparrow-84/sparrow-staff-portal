import { useEffect, useState } from 'react';
import { Drawer } from '../lcp/Drawer';
import { RichOrPlainView } from '../lcp/RichText';
import { RichTextEditor } from '../stories/RichTextEditor';
import { useRequiredFields } from '@/hooks/useRequiredFields';
import { updateEvent, type EventInput, type PartnershipEvent } from '@/lib/partnerships-tabs';

function shortDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

// Read-only expanded view by default (so long notes/attendee lists are actually readable,
// not squeezed into a table cell) — Edit switches the same drawer into editable fields.
export function EventDetailPanel({
  open,
  event,
  onClose,
  onChanged,
}: {
  open: boolean;
  event: PartnershipEvent | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EventInput | null>(null);
  const [busy, setBusy] = useState(false);

  const { fieldClass, fieldError, clear, validate } = useRequiredFields([
    { key: 'ed-event-name', label: 'Event name', valid: (form?.event_name.trim().length ?? 0) > 0 },
    { key: 'ed-event-date', label: 'Date', valid: !!form?.event_date },
  ]);

  useEffect(() => {
    if (open && event) {
      setEditing(false);
      setForm({
        event_name: event.event_name,
        event_date: event.event_date,
        location: event.location,
        attendees: event.attendees,
        notes: event.notes,
      });
    }
  }, [open, event]);

  if (!event || !form) return null;

  async function save() {
    if (!event || !form) return;
    if (!validate()) return;
    setBusy(true);
    try {
      await updateEvent(event.id, form);
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
      title={event.event_name}
      subtitle={shortDate(event.event_date)}
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
                  event_name: event.event_name,
                  event_date: event.event_date,
                  location: event.location,
                  attendees: event.attendees,
                  notes: event.notes,
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
            <p className="field-label">Date</p>
            <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">{shortDate(event.event_date)}</p>
          </div>
          <div>
            <p className="field-label">Location</p>
            <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">{event.location ?? '—'}</p>
          </div>
          <div>
            <p className="field-label">Sparrow attendees</p>
            <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">{event.attendees ?? '—'}</p>
          </div>
          <div>
            <p className="field-label">Notes</p>
            <RichOrPlainView text={event.notes} empty="—" />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="field-label field-label-required" htmlFor="ed-event-name">Event name</label>
            <input
              id="ed-event-name"
              className={fieldClass('ed-event-name', 'field-input w-full')}
              value={form.event_name}
              onChange={(e) => { setForm((f) => f && { ...f, event_name: e.target.value }); clear('ed-event-name'); }}
            />
            {fieldError('ed-event-name') && <p className="mt-1 text-xs text-priority-p1">{fieldError('ed-event-name')}</p>}
          </div>
          <div>
            <label className="field-label field-label-required" htmlFor="ed-event-date">Date</label>
            <input
              id="ed-event-date"
              type="date"
              className={fieldClass('ed-event-date', 'field-input w-full')}
              value={form.event_date}
              onChange={(e) => { setForm((f) => f && { ...f, event_date: e.target.value }); clear('ed-event-date'); }}
            />
            {fieldError('ed-event-date') && <p className="mt-1 text-xs text-priority-p1">{fieldError('ed-event-date')}</p>}
          </div>
          <div>
            <label className="field-label">Location</label>
            <input
              className="field-input w-full"
              value={form.location ?? ''}
              onChange={(e) => setForm((f) => f && { ...f, location: e.target.value || null })}
            />
          </div>
          <div>
            <label className="field-label">Sparrow attendees</label>
            <input
              className="field-input w-full"
              value={form.attendees ?? ''}
              onChange={(e) => setForm((f) => f && { ...f, attendees: e.target.value || null })}
            />
          </div>
          <div>
            <label className="field-label">Notes</label>
            <RichTextEditor
              value={form.notes ?? ''}
              onChange={(html) => setForm((f) => f && { ...f, notes: html || null })}
              className="min-h-[8rem]"
            />
          </div>
        </div>
      )}
    </Drawer>
  );
}
