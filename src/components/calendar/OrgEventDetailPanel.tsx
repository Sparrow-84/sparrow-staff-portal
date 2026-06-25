import { useState } from 'react';
import {
  deleteCalendarEvent,
  deleteCalendarEventAndFuture,
  KIND_LABEL,
  KIND_PILL,
  type CalendarEvent,
} from '@/lib/calendar';
import { Drawer } from '@/components/lcp/Drawer';

interface Props {
  event: CalendarEvent | null;
  currentUserId: string;
  isAdmin: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

export function OrgEventDetailPanel({ event, currentUserId, isAdmin, onClose, onDeleted }: Props) {
  const [confirm, setConfirm] = useState(false);
  const [deletingMode, setDeletingMode] = useState<null | 'single' | 'future'>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setConfirm(false);
    setError(null);
    onClose();
  }

  async function handleDelete(mode: 'single' | 'future') {
    if (!event) return;
    setDeletingMode(mode);
    setError(null);
    try {
      if (mode === 'future' && event.recurrence_id) {
        await deleteCalendarEventAndFuture(event.recurrence_id, event.starts_at);
      } else {
        await deleteCalendarEvent(event.id);
      }
      setDeletingMode(null);
      setConfirm(false);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete.');
      setDeletingMode(null);
    }
  }

  if (!event) return null;

  const canDelete = isAdmin || event.created_by === currentUserId;
  const isRecurring = !!event.recurrence_id;

  const startsAt = new Date(event.starts_at);
  const endsAt = event.ends_at ? new Date(event.ends_at) : null;

  const dateLabel = startsAt.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const timeLabel = event.all_day
    ? 'All day'
    : endsAt
      ? `${startsAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} – ${endsAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
      : startsAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return (
    <Drawer
      open={!!event}
      onClose={handleClose}
      title={event.title}
      subtitle={KIND_LABEL[event.kind]}
      footer={
        canDelete ? (
          <div className="space-y-2">
            {!confirm ? (
              <button
                onClick={() => setConfirm(true)}
                className="w-full rounded-xl border border-priority-p1/40 py-2 text-sm font-medium text-priority-p1 hover:bg-priority-p1/5"
              >
                Delete event
              </button>
            ) : (
              <>
                <p className="text-xs text-sparrow-gray">
                  {isRecurring
                    ? 'Delete just this event, or this one and all future events in the series?'
                    : 'This cannot be undone.'}
                </p>
                {error && <p className="text-xs text-priority-p1">{error}</p>}
                <div className="flex flex-col gap-2">
                  {isRecurring ? (
                    <>
                      <button
                        onClick={() => handleDelete('single')}
                        disabled={deletingMode !== null}
                        className="w-full rounded-xl border border-priority-p1/40 py-2 text-sm font-medium text-priority-p1 hover:bg-priority-p1/5"
                      >
                        {deletingMode === 'single' ? 'Deleting…' : 'This event only'}
                      </button>
                      <button
                        onClick={() => handleDelete('future')}
                        disabled={deletingMode !== null}
                        className="w-full rounded-xl bg-priority-p1 py-2 text-sm font-medium text-white hover:bg-priority-p1/90"
                      >
                        {deletingMode === 'future' ? 'Deleting…' : 'This and all future events'}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleDelete('single')}
                      disabled={deletingMode !== null}
                      className="w-full rounded-xl bg-priority-p1 py-2 text-sm font-medium text-white hover:bg-priority-p1/90"
                    >
                      {deletingMode === 'single' ? 'Deleting…' : 'Confirm delete'}
                    </button>
                  )}
                  <button
                    onClick={() => setConfirm(false)}
                    disabled={deletingMode !== null}
                    className="btn-ghost w-full text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="space-y-5">
        <div className="flex gap-2">
          <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${KIND_PILL[event.kind]}`}>
            {KIND_LABEL[event.kind]}
          </span>
          {isRecurring && (
            <span className="inline-block rounded-full bg-sparrow-mist px-3 py-1 text-xs font-medium text-sparrow-gray">
              Recurring
            </span>
          )}
        </div>

        <div>
          <p className="text-sm font-medium text-sparrow-ink">{dateLabel}</p>
          <p className="mt-0.5 text-sm text-sparrow-gray">{timeLabel}</p>
        </div>

        {event.location && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray">Location</p>
            <p className="mt-0.5 text-sm text-sparrow-ink">{event.location}</p>
          </div>
        )}
      </div>
    </Drawer>
  );
}
