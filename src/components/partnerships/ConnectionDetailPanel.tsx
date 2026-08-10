import { useEffect, useState } from 'react';
import type { Profile } from '@/lib/types';
import { Drawer } from '../lcp/Drawer';
import { updateConnection, type ConnectionInput, type PartnershipConnection, type PartnershipEvent } from '@/lib/partnerships-tabs';
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
  onClose,
  onChanged,
}: {
  open: boolean;
  connection: PartnershipConnection | null;
  events: PartnershipEvent[];
  profiles: Profile[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditableFields | null>(null);
  const [busy, setBusy] = useState(false);

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
    }
  }, [open, connection]);

  if (!connection || !form) return null;

  const eventName = connection.event_id
    ? events.find((e) => e.id === connection.event_id)?.event_name ?? '—'
    : '—';

  async function save() {
    if (!connection || !form) return;
    if (!form.name.trim()) return;
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
            <label className="field-label">Name *</label>
            <input
              className="field-input w-full"
              value={form.name}
              onChange={(e) => setForm((f) => f && { ...f, name: e.target.value })}
            />
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
