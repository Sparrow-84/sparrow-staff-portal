import { useEffect, useState } from 'react';
import { expandEvents, fetchCalendar, KIND_PILL, type EventOccurrence } from '@/lib/calendar';

// Sequence 1 calendar foundation: a 4-week agenda of the team calendar (recurring
// cadences + one-offs, expanded). Month grid, Gantt/timeline, and add/edit/postpone
// land in the next slice — the data model + recurrence expander are in place here.
export function CalendarView() {
  const [occ, setOcc] = useState<EventOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const events = await fetchCalendar();
        const from = new Date();
        from.setHours(0, 0, 0, 0);
        const to = new Date(from);
        to.setDate(to.getDate() + 28);
        setOcc(expandEvents(events, from, to));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load the calendar.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const byDay = new Map<string, EventOccurrence[]>();
  for (const o of occ) {
    const key = o.occursAt.toDateString();
    (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(o);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-serif text-2xl font-semibold">Team calendar</h1>
      <p className="mt-1 text-sm text-sparrow-gray">The next four weeks.</p>

      {loading && <p className="mt-8 text-sm text-sparrow-gray">Loading…</p>}
      {error && <p className="mt-8 text-sm text-priority-p1">{error}</p>}
      {!loading && !error && occ.length === 0 && (
        <p className="mt-8 text-sm text-sparrow-gray">Nothing scheduled in the next four weeks.</p>
      )}

      <div className="mt-6 space-y-6">
        {[...byDay.entries()].map(([day, items]) => (
          <section key={day}>
            <h2 className="font-serif text-sm font-semibold text-sparrow-green">
              {new Date(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </h2>
            <ul className="mt-2 space-y-1.5">
              {items.map((o, i) => (
                <li
                  key={`${o.event.id}-${i}`}
                  className="flex items-center gap-3 rounded-lg border border-sparrow-rule bg-white px-3 py-2"
                >
                  <span className="w-20 shrink-0 text-xs text-sparrow-gray">
                    {o.event.all_day
                      ? 'All day'
                      : o.occursAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${KIND_PILL[o.event.kind]}`}>
                    {o.event.kind.replace('_', ' ')}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-sparrow-ink">{o.event.title}</span>
                  {o.event.location && (
                    <span className="hidden shrink-0 text-xs text-sparrow-gray sm:inline">{o.event.location}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
