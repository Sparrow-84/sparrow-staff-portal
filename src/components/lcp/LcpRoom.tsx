import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchEvents,
  fetchAllHomework,
  fetchFamilies,
  fetchRedemptions,
  fetchSessions,
} from '@/lib/lcp';
import {
  EVENT_LABEL,
  FAMILY_STATUS,
  TOTAL_SESSIONS,
  type CurriculumSession,
  type Family,
  type Homework,
  type LcpEvent,
  type Redemption,
} from '@/lib/lcp-types';
import { dayLabel, timeLabel } from '@/lib/lcp-format';
import { FamilyDetailPanel } from './FamilyDetailPanel';
import { SessionBriefPanel } from './SessionBriefPanel';
import { AddFamilyPanel } from './AddFamilyPanel';

export function LcpRoom() {
  const { profile } = useAuth();
  const [families, setFamilies] = useState<Family[]>([]);
  const [homework, setHomework] = useState<Homework[]>([]);
  const [events, setEvents] = useState<LcpEvent[]>([]);
  const [sessions, setSessions] = useState<CurriculumSession[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<'families' | 'calendar'>('families');
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [event, setEvent] = useState<LcpEvent | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [fam, hw, ev, se, red] = await Promise.all([
        fetchFamilies(),
        fetchAllHomework(),
        fetchEvents(),
        fetchSessions(),
        fetchRedemptions(),
      ]);
      setFamilies(fam);
      setHomework(hw);
      setEvents(ev);
      setSessions(se);
      setRedemptions(red);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load LifeChange data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const homeworkByFamily = useMemo(() => {
    const map = new Map<string, Homework[]>();
    for (const hw of homework) {
      const list = map.get(hw.family_id) ?? [];
      list.push(hw);
      map.set(hw.family_id, list);
    }
    return map;
  }, [homework]);

  const pendingRedemptions = redemptions.filter((r) => r.status === 'requested');
  const familyName = (id: string) => families.find((f) => f.id === id)?.display_name ?? 'Family';

  const stats = {
    active: families.length,
    onTrack: families.filter((f) => f.status === 'on_track').length,
    needs: families.filter((f) => f.status === 'needs_attention').length,
    onboarding: families.filter((f) => f.status === 'onboarding').length,
  };

  function openFamily(id: string) {
    setFamilyId(id);
    setFamilyOpen(true);
  }
  function openBrief(ev: LcpEvent) {
    setEvent(ev);
    setBriefOpen(true);
  }

  if (loading) return <p className="p-8 text-sm text-sparrow-gray">Loading LifeChange…</p>;
  if (error) return <p className="p-8 text-sm text-priority-p1">{error}</p>;

  const now = Date.now();
  const upcoming = events.filter((e) => new Date(e.starts_at).getTime() >= now);
  const past = events.filter((e) => new Date(e.starts_at).getTime() < now).reverse();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold">LifeChange</h1>
          <p className="mt-1 text-sm text-sparrow-gray">
            {stats.active} families · {stats.onTrack} on track · {stats.needs} need attention · {stats.onboarding} onboarding
          </p>
        </div>
        <button onClick={() => setAddOpen(true)} className="btn-primary shrink-0">
          + Add family
        </button>
      </div>

      {pendingRedemptions.length > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-sparrow-gold/40 bg-sparrow-cream px-4 py-3 text-sm">
          <span>
            🎁 {pendingRedemptions.length} voucher redemption{pendingRedemptions.length > 1 ? 's' : ''} waiting to be
            fulfilled.
          </span>
          <button onClick={() => openFamily(pendingRedemptions[0].family_id)} className="font-medium text-sparrow-green">
            Open {familyName(pendingRedemptions[0].family_id)} →
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="mt-6 inline-flex rounded-xl border border-sparrow-rule bg-white p-1 text-sm">
        {(['families', 'calendar'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 font-medium capitalize transition ${
              tab === t ? 'bg-sparrow-green text-white' : 'text-sparrow-gray hover:text-sparrow-ink'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'families' ? (
        <div className="mt-6 space-y-3">
          {families.map((f) => {
            const fhw = homeworkByFamily.get(f.id) ?? [];
            const open = fhw.filter((h) => h.status !== 'complete').length;
            const pct = Math.round((f.current_session_number / TOTAL_SESSIONS) * 100);
            return (
              <button
                key={f.id}
                onClick={() => openFamily(f.id)}
                className="flex w-full items-center gap-4 rounded-2xl border border-sparrow-rule bg-white p-4 text-left shadow-card transition hover:border-sparrow-green/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-sparrow-ink">{f.display_name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${FAMILY_STATUS[f.status].chip}`}>
                      {FAMILY_STATUS[f.status].label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-sparrow-gray">
                    Session {f.current_session_number} of {TOTAL_SESSIONS} · {open} open homework
                  </p>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-sparrow-sage">
                    <div className="h-full rounded-full bg-sparrow-green" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <span className="shrink-0 text-sparrow-gray">›</span>
              </button>
            );
          })}

          {/* Homework board — this week, one column per family */}
          <section className="mt-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sparrow-gray">Homework board</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {families.map((f) => {
                const open = (homeworkByFamily.get(f.id) ?? []).filter((h) => h.status !== 'complete');
                return (
                  <div key={f.id} className="rounded-xl border border-sparrow-rule bg-white p-3">
                    <p className="text-sm font-medium text-sparrow-ink">{f.display_name}</p>
                    <ul className="mt-2 space-y-1.5">
                      {open.length === 0 && <li className="text-xs text-sparrow-gray">All clear ✓</li>}
                      {open.map((h) => (
                        <li key={h.id} className="flex items-center gap-2 text-xs text-sparrow-ink">
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              h.status === 'submitted' ? 'bg-sparrow-gold' : 'bg-sparrow-rule'
                            }`}
                          />
                          <span className="truncate">{h.title}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <EventList title="Upcoming" events={upcoming} onOpen={openBrief} emptyText="No upcoming sessions." />
          <EventList title="Past" events={past} onOpen={openBrief} emptyText="" />
          <p className="text-xs text-sparrow-gray">
            Click a session to take attendance, assign homework, and file a session note.
          </p>
        </div>
      )}

      <FamilyDetailPanel
        open={familyOpen}
        family={familyId ? families.find((f) => f.id === familyId) ?? null : null}
        sessions={sessions}
        currentUserId={profile?.id ?? ''}
        onClose={() => setFamilyOpen(false)}
        onChanged={load}
      />
      <SessionBriefPanel
        open={briefOpen}
        event={event}
        families={families}
        sessions={sessions}
        currentUserId={profile?.id ?? ''}
        onClose={() => setBriefOpen(false)}
        onChanged={load}
      />
      <AddFamilyPanel open={addOpen} onClose={() => setAddOpen(false)} onCreated={load} />
    </div>
  );
}

function EventList({
  title,
  events,
  onOpen,
  emptyText,
}: {
  title: string;
  events: LcpEvent[];
  onOpen: (e: LcpEvent) => void;
  emptyText: string;
}) {
  if (events.length === 0 && !emptyText) return null;
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sparrow-gray">{title}</h2>
      {events.length === 0 ? (
        <p className="text-sm text-sparrow-gray">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-sparrow-rule overflow-hidden rounded-xl border border-sparrow-rule bg-white">
          {events.map((ev) => (
            <li key={ev.id}>
              <button onClick={() => onOpen(ev)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-sparrow-mist">
                <div className="w-28 shrink-0 text-xs text-sparrow-gray">
                  {dayLabel(ev.starts_at)} · {timeLabel(ev.starts_at)}
                </div>
                <span className="flex-1 text-sm font-medium text-sparrow-ink">{ev.title}</span>
                <span className="shrink-0 text-xs text-sparrow-gray">{EVENT_LABEL[ev.kind]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
