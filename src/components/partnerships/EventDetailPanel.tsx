import { useEffect, useState } from 'react';
import { Drawer } from '../lcp/Drawer';
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
    if (!form.event_name.trim() || !form.event_date) return;
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
            <p className="text-sm text-sparrow-ink">{shortDate(event.event_date)}</p>
          </div>
          <div>
            <p className="field-label">Location</p>
            <p className="text-sm text-sparrow-ink">{event.location ?? '—'}</p>
          </div>
          <div>
            <p className="field-label">Sparrow attendees</p>
            <p className="text-sm text-sparrow-ink">{event.attendees ?? '—'}</p>
          </div>
          <div>
            <p className="field-label">Notes</p>
            <p className="whitespace-pre-wrap text-sm text-sparrow-ink">{event.notes ?? '—'}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="field-label">Event name *</label>
            <input
              className="field-input w-full"
              value={form.event_name}
              onChange={(e) => setForm((f) => f && { ...f, event_name: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label">Date *</label>
            <input
              type="date"
              className="field-input w-full"
              value={form.event_date}
              onChange={(e) => setForm((f) => f && { ...f, event_date: e.target.value })}
            />
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
            <textarea
              rows={4}
              className="field-input w-full"
              value={form.notes ?? ''}
              onChange={(e) => setForm((f) => f && { ...f, notes: e.target.value || null })}
            />
          </div>
        </div>
      )}
    </Drawer>
  );
}
