import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { KIND_LABEL, KIND_PILL, type CalendarEvent } from '@/lib/calendar';

interface Props {
  event: CalendarEvent;
  userId: string;
  onClose: () => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function MeetingNotesView({ event, userId, onClose }: Props) {
  const [prep, setPrep] = useState('');
  const [live, setLive] = useState('');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPrep = useRef('');
  const latestLive = useRef('');

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('meeting_notes')
        .select('prep_notes, live_notes')
        .eq('event_id', event.id)
        .eq('user_id', userId)
        .maybeSingle();
      if (data) {
        setPrep(data.prep_notes);
        setLive(data.live_notes);
        latestPrep.current = data.prep_notes;
        latestLive.current = data.live_notes;
      }
      setLoading(false);
    }
    void load();
  }, [event.id, userId]);

  // Flush any pending save on unmount — best-effort, no await
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      void supabase.from('meeting_notes').upsert(
        {
          event_id: event.id,
          user_id: userId,
          prep_notes: latestPrep.current,
          live_notes: latestLive.current,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'event_id,user_id' },
      );
    };
  }, [event.id, userId]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setStatus('idle');
    saveTimer.current = setTimeout(async () => {
      setStatus('saving');
      const { error } = await supabase.from('meeting_notes').upsert(
        {
          event_id: event.id,
          user_id: userId,
          prep_notes: latestPrep.current,
          live_notes: latestLive.current,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'event_id,user_id' },
      );
      setStatus(error ? 'error' : 'saved');
    }, 1000);
  }, [event.id, userId]);

  function handlePrepChange(val: string) {
    setPrep(val);
    latestPrep.current = val;
    scheduleSave();
  }

  function handleLiveChange(val: string) {
    setLive(val);
    latestLive.current = val;
    scheduleSave();
  }

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

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white">
        <p className="text-sm text-sparrow-gray">Loading notes…</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-sparrow-rule px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${KIND_PILL[event.kind]}`}>
              {KIND_LABEL[event.kind]}
            </span>
            <h1 className="text-lg font-semibold text-sparrow-ink">{event.title}</h1>
          </div>
          <p className="mt-0.5 text-sm text-sparrow-gray">{dateLabel} · {timeLabel}</p>
        </div>
        <div className="flex items-center gap-4">
          {status === 'saving' && <span className="text-xs text-sparrow-gray">Saving…</span>}
          {status === 'saved' && <span className="text-xs text-sparrow-gray">Saved</span>}
          {status === 'error' && <span className="text-xs text-priority-p1">Error saving</span>}
          <button
            onClick={onClose}
            className="rounded-xl border border-sparrow-rule px-4 py-2 text-sm font-medium text-sparrow-ink hover:bg-sparrow-mist"
          >
            Exit meeting mode
          </button>
        </div>
      </div>

      {/* Two-pane body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Prep Notes */}
        <div className="flex flex-1 flex-col border-r border-sparrow-rule">
          <div className="border-b border-sparrow-rule bg-amber-50 px-6 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Prep Notes</p>
            <p className="text-xs text-amber-600/70">Written before the meeting · only visible to you</p>
          </div>
          <textarea
            value={prep}
            onChange={(e) => handlePrepChange(e.target.value)}
            placeholder="Add your prep notes here — agenda, talking points, questions to raise…"
            className="flex-1 resize-none bg-amber-50/20 p-6 text-sm leading-relaxed text-sparrow-ink placeholder-sparrow-gray/40 focus:outline-none"
          />
        </div>

        {/* Live Notes */}
        <div className="flex flex-1 flex-col">
          <div className="border-b border-sparrow-rule bg-green-50 px-6 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-green">Live Notes</p>
            <p className="text-xs text-sparrow-green/60">Written during the meeting · only visible to you</p>
          </div>
          <textarea
            value={live}
            onChange={(e) => handleLiveChange(e.target.value)}
            placeholder="Take notes here as the meeting happens — decisions, action items, who said what…"
            className="flex-1 resize-none bg-green-50/20 p-6 text-sm leading-relaxed text-sparrow-ink placeholder-sparrow-gray/40 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}
