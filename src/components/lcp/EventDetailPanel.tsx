import { useState } from 'react';
import { EVENT_LABEL, type LcpEvent } from '@/lib/lcp-types';
import { deleteEvent, deleteEventAndFuture } from '@/lib/lcp';
import { dayLabel, timeLabel } from '@/lib/lcp-format';
import { Drawer } from './Drawer';

const KIND_COLOR: Record<string, string> = {
  curriculum: 'bg-sparrow-green/10 text-sparrow-green',
  one_on_one:  'bg-amber-100 text-amber-700',
  dinner:      'bg-violet-100 text-violet-700',
  volunteer:   'bg-sky-100 text-sky-700',
  other:       'bg-slate-100 text-slate-600',
};

interface Props {
  event: LcpEvent | null;
  onClose: () => void;
  onLogSession: (event: LcpEvent) => void;
  onDeleted: () => void;
}

export function EventDetailPanel({ event, onClose, onLogSession, onDeleted }: Props) {
  const [confirmStep, setConfirmStep] = useState<'idle' | 'confirm'>('idle');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setConfirmStep('idle');
    setError(null);
    onClose();
  }

  async function handleDelete(mode: 'single' | 'future') {
    if (!event) return;
    setDeleting(true);
    setError(null);
    try {
      if (mode === 'future' && event.recurrence_id) {
        await deleteEventAndFuture(event.recurrence_id, event.starts_at);
      } else {
        await deleteEvent(event.id);
      }
      setConfirmStep('idle');
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete.');
      setDeleting(false);
    }
  }

  if (!event) return null;

  const hasEnds = !!event.ends_at;
  const timeRange = hasEnds
    ? `${timeLabel(event.starts_at)} – ${timeLabel(event.ends_at!)}`
    : timeLabel(event.starts_at);
  const isRecurring = !!event.recurrence_id;

  return (
    <Drawer
      open={!!event}
      onClose={handleClose}
      title={event.title}
      subtitle={EVENT_LABEL[event.kind]}
      footer={
        confirmStep === 'idle' ? (
          <button
            onClick={() => setConfirmStep('confirm')}
            className="w-full rounded-xl border border-priority-p1/40 py-2 text-sm font-medium text-priority-p1 hover:bg-priority-p1/5"
          >
            Delete event
          </button>
        ) : (
          <div className="space-y-2">
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
                    disabled={deleting}
                    className="w-full rounded-xl border border-priority-p1/40 py-2 text-sm font-medium text-priority-p1 hover:bg-priority-p1/5"
                  >
                    {deleting ? 'Deleting…' : 'This event only'}
                  </button>
                  <button
                    onClick={() => handleDelete('future')}
                    disabled={deleting}
                    className="w-full rounded-xl bg-priority-p1 py-2 text-sm font-medium text-white hover:bg-priority-p1/90"
                  >
                    {deleting ? 'Deleting…' : 'This and all future events'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleDelete('single')}
                  disabled={deleting}
                  className="w-full rounded-xl bg-priority-p1 py-2 text-sm font-medium text-white hover:bg-priority-p1/90"
                >
                  {deleting ? 'Deleting…' : 'Confirm delete'}
                </button>
              )}
              <button
                onClick={() => setConfirmStep('idle')}
                disabled={deleting}
                className="btn-ghost w-full text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )
      }
    >
      <div className="space-y-5">
        {/* Type badge */}
        <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${KIND_COLOR[event.kind] ?? 'bg-slate-100 text-slate-600'}`}>
          {EVENT_LABEL[event.kind]}
        </span>

        {/* Date + time */}
        <div>
          <p className="text-sm font-medium text-sparrow-ink">
            {dayLabel(event.starts_at)}
          </p>
          <p className="mt-0.5 text-sm text-sparrow-gray">{timeRange}</p>
        </div>

        {/* Location */}
        {event.location && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray">Location</p>
            <p className="mt-0.5 text-sm text-sparrow-ink">{event.location}</p>
          </div>
        )}

        {/* Badges */}
        <div className="flex gap-2">
          {event.mandatory && (
            <span className="rounded-full bg-sparrow-mist px-2.5 py-1 text-xs font-medium text-sparrow-gray">
              Mandatory
            </span>
          )}
          {isRecurring && (
            <span className="rounded-full bg-sparrow-mist px-2.5 py-1 text-xs font-medium text-sparrow-gray">
              Recurring
            </span>
          )}
        </div>

        {/* Log session */}
        <div className="border-t border-sparrow-rule pt-4">
          <button
            onClick={() => { handleClose(); onLogSession(event); }}
            className="btn-primary w-full"
          >
            Log session →
          </button>
        </div>
      </div>
    </Drawer>
  );
}
