import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { MeetingNotesView } from '@/components/calendar/MeetingNotesView';
import { fetchMyNotesIndex, fetchSharedNotesIndex, type MyNoteEntry, type SharedNoteEntry } from '@/lib/notesHub';
import { fetchMyIdeas, createIdea, setIdeaCompleted, deleteIdea, type Idea } from '@/lib/ideas';
import type { CalendarEvent } from '@/lib/calendar';

type Tab = 'mine' | 'shared' | 'ideas';

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

function dayBadge(iso: string): { day: string; weekday: string } {
  const d = new Date(iso);
  return {
    day: String(d.getDate()).padStart(2, '0'),
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
  };
}

function monthKey(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface NoteRow {
  event: CalendarEvent;
  badge: 'Your notes' | 'Shared';
  sub: string;
}

function NoteList({
  rows,
  search,
  onSearch,
  showAll,
  onShowAll,
  onOpen,
  emptyLabel,
}: {
  rows: NoteRow[];
  search: string;
  onSearch: (v: string) => void;
  showAll: boolean;
  onShowAll: () => void;
  onOpen: (event: CalendarEvent) => void;
  emptyLabel: string;
}) {
  const cutoff = monthsAgo(3);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (!showAll && new Date(r.event.starts_at) < cutoff) return false;
      if (search.trim() && !r.event.title.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, showAll]);

  const hiddenOlder = !showAll && rows.some((r) => new Date(r.event.starts_at) < cutoff && !filtered.includes(r));

  let lastMonth = '';

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-sparrow-rule bg-white px-3 py-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-sparrow-gray/60">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search by event title"
            className="w-full text-sm outline-none placeholder:text-sparrow-gray/60"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-sparrow-gray">{search.trim() ? 'No notes match your search.' : emptyLabel}</p>
      ) : (
        filtered.map((r) => {
          const mk = monthKey(r.event.starts_at);
          const showMonth = mk !== lastMonth;
          lastMonth = mk;
          const { day, weekday } = dayBadge(r.event.starts_at);
          return (
            <div key={r.event.id}>
              {showMonth && (
                <p className="px-1 pb-1.5 pt-3 text-xs font-semibold uppercase tracking-wide text-sparrow-gray/70 first:pt-0">{mk}</p>
              )}
              <button
                onClick={() => onOpen(r.event)}
                className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left hover:border-sparrow-rule hover:bg-sparrow-mist"
              >
                <div className="w-10 shrink-0 font-mono text-xs text-sparrow-gray/70">
                  <span className="block text-base font-semibold text-sparrow-ink">{day}</span>
                  {weekday}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-sparrow-ink">{r.event.title}</p>
                  <p className="truncate text-xs text-sparrow-gray">{r.sub}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                    r.badge === 'Your notes' ? 'bg-sparrow-green/10 text-sparrow-green' : 'bg-sparrow-gold/15 text-amber-700'
                  }`}
                >
                  {r.badge}
                </span>
              </button>
            </div>
          );
        })
      )}

      {hiddenOlder && (
        <div className="mt-2 border-t border-sparrow-rule pt-3 text-center">
          <button onClick={onShowAll} className="text-xs font-medium text-sparrow-gray hover:text-sparrow-green">
            See notes older than 3 months
          </button>
        </div>
      )}
    </div>
  );
}

function IdeasTab({ userId }: { userId: string }) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchMyIdeas(userId).then(setIdeas).finally(() => setLoading(false));
  }, [userId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const created = await createIdea(userId, title.trim(), description.trim());
      setIdeas((prev) => [created, ...prev]);
      setTitle('');
      setDescription('');
    } finally {
      setSaving(false);
    }
  }

  async function toggle(idea: Idea) {
    const completed = !idea.completed_at;
    setIdeas((prev) =>
      prev.map((i) => (i.id === idea.id ? { ...i, completed_at: completed ? new Date().toISOString() : null } : i)),
    );
    await setIdeaCompleted(idea.id, completed);
  }

  async function remove(idea: Idea) {
    setIdeas((prev) => prev.filter((i) => i.id !== idea.id));
    await deleteIdea(idea.id);
  }

  const active = ideas.filter((i) => !i.completed_at);
  const done = ideas.filter((i) => i.completed_at);

  function Row({ idea }: { idea: Idea }) {
    return (
      <div className="group flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-sparrow-mist">
        <input
          type="checkbox"
          checked={Boolean(idea.completed_at)}
          onChange={() => void toggle(idea)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-sparrow-rule text-sparrow-green focus:ring-sparrow-green"
        />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${idea.completed_at ? 'text-sparrow-gray line-through' : 'text-sparrow-ink'}`}>
            {idea.title}
          </p>
          {idea.description && (
            <p className={`mt-0.5 text-xs ${idea.completed_at ? 'text-sparrow-gray/70 line-through' : 'text-sparrow-gray'}`}>
              {idea.description}
            </p>
          )}
          <p className="mt-1 text-[11px] text-sparrow-gray/60">Added {formatDate(idea.created_at)}</p>
        </div>
        <button
          onClick={() => void remove(idea)}
          title="Delete"
          aria-label="Delete idea"
          className="shrink-0 rounded p-1 text-sparrow-gray/50 opacity-0 hover:text-priority-p1 group-hover:opacity-100"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="mb-5 rounded-xl border border-sparrow-rule bg-white p-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Idea title"
          className="w-full border-none p-1 text-sm font-semibold outline-none placeholder:font-normal placeholder:text-sparrow-gray/60"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add more detail (optional)"
          rows={2}
          className="w-full resize-none border-none p-1 text-sm text-sparrow-gray outline-none placeholder:text-sparrow-gray/60"
        />
        <div className="mt-1 flex justify-end border-t border-dashed border-sparrow-rule pt-2">
          <button
            type="submit"
            disabled={!title.trim() || saving}
            className="rounded-lg bg-sparrow-green px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Add idea
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-sparrow-gray">Loading…</p>
      ) : ideas.length === 0 ? (
        <p className="py-8 text-center text-sm text-sparrow-gray">
          Nothing here yet — drop a quick idea above any time one comes to you.
        </p>
      ) : (
        <>
          {active.map((idea) => (
            <Row key={idea.id} idea={idea} />
          ))}
          {done.length > 0 && (
            <>
              <p className="mt-3 border-t border-sparrow-rule pt-3 text-xs font-semibold uppercase tracking-wide text-sparrow-gray/70">
                Checked off
              </p>
              {done.map((idea) => (
                <Row key={idea.id} idea={idea} />
              ))}
            </>
          )}
        </>
      )}

      <p className="mt-6 text-xs text-sparrow-gray/70">Only you can see this list — nothing here is shared with other staff.</p>
    </div>
  );
}

export function NotesView() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('mine');
  const [myNotes, setMyNotes] = useState<MyNoteEntry[]>([]);
  const [sharedNotes, setSharedNotes] = useState<SharedNoteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [mySearch, setMySearch] = useState('');
  const [sharedSearch, setSharedSearch] = useState('');
  const [myShowAll, setMyShowAll] = useState(false);
  const [sharedShowAll, setSharedShowAll] = useState(false);
  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    if (!profile) return;
    void Promise.all([fetchMyNotesIndex(profile.id), fetchSharedNotesIndex(profile.id)])
      .then(([mine, shared]) => {
        setMyNotes(mine);
        setSharedNotes(shared);
      })
      .finally(() => setLoading(false));
  }, [profile]);

  if (!profile) return null;

  const myRows: NoteRow[] = myNotes.map((n) => ({
    event: n.event,
    badge: 'Your notes',
    sub: `Updated ${formatDate(n.updated_at)}`,
  }));
  const sharedRows: NoteRow[] = sharedNotes.map((n) => ({
    event: n.event,
    badge: 'Shared',
    sub: n.updatedByName ? `Last updated by ${n.updatedByName}` : `Updated ${formatDate(n.updated_at)}`,
  }));

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'mine', label: 'My Notes' },
    { id: 'shared', label: 'Shared Notes' },
    { id: 'ideas', label: 'Ideas' },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-5">
        <h1 className="font-serif text-2xl font-semibold">Notes</h1>
        <p className="mt-1 text-sm text-sparrow-gray">Everything you've written or been sent, in one place.</p>
      </div>

      <div className="mb-5 inline-flex rounded-lg border border-sparrow-rule bg-sparrow-mist p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
              tab === t.id ? 'bg-sparrow-green text-white' : 'text-sparrow-gray hover:text-sparrow-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'ideas' && loading ? (
        <p className="text-sm text-sparrow-gray">Loading…</p>
      ) : tab === 'mine' ? (
        <NoteList
          rows={myRows}
          search={mySearch}
          onSearch={setMySearch}
          showAll={myShowAll}
          onShowAll={() => setMyShowAll(true)}
          onOpen={setOpenEvent}
          emptyLabel="You haven't written any notes yet — open an event from the calendar and click Notes to start one."
        />
      ) : tab === 'shared' ? (
        <NoteList
          rows={sharedRows}
          search={sharedSearch}
          onSearch={setSharedSearch}
          showAll={sharedShowAll}
          onShowAll={() => setSharedShowAll(true)}
          onOpen={setOpenEvent}
          emptyLabel="No shared notes yet on events you're attending."
        />
      ) : (
        <IdeasTab userId={profile.id} />
      )}

      {openEvent && (
        <MeetingNotesView event={openEvent} userId={profile.id} onClose={() => setOpenEvent(null)} />
      )}
    </div>
  );
}
