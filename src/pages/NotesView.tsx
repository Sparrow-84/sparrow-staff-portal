import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { MeetingNotesView } from '@/components/calendar/MeetingNotesView';
import { OrphanedNoteView } from '@/components/calendar/OrphanedNoteView';
import { fetchMyNotesIndex, fetchSharedNotesIndex, type MyNoteEntry, type SharedNoteEntry } from '@/lib/notesHub';
import { fetchMyIdeas, fetchTeamIdeas, createIdea, setIdeaCompleted, setIdeaShared, deleteIdea, type Idea } from '@/lib/ideas';
import { fetchProfiles } from '@/lib/data';
import type { Profile } from '@/lib/types';
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
  noteId: string;
  event: CalendarEvent | null;
  title: string;
  startsAt: string;
  scope: 'private' | 'shared';
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
  onOpen: (row: NoteRow) => void;
  emptyLabel: string;
}) {
  const cutoff = monthsAgo(3);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (!showAll && new Date(r.startsAt) < cutoff) return false;
      if (search.trim() && !r.title.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, showAll]);

  const hiddenOlder = !showAll && rows.some((r) => new Date(r.startsAt) < cutoff && !filtered.includes(r));

  let lastMonth = '';

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface px-3 py-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-sparrow-gray/60">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search by event title"
            className="w-full bg-white dark:bg-sparrow-dark-surface text-sm outline-none placeholder:text-sparrow-gray/60"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">{search.trim() ? 'No notes match your search.' : emptyLabel}</p>
      ) : (
        filtered.map((r) => {
          const mk = monthKey(r.startsAt);
          const showMonth = mk !== lastMonth;
          lastMonth = mk;
          const { day, weekday } = dayBadge(r.startsAt);
          return (
            <div key={r.noteId}>
              {showMonth && (
                <p className="px-1 pb-1.5 pt-3 text-xs font-semibold uppercase tracking-wide text-sparrow-gray/70 first:pt-0">{mk}</p>
              )}
              <button
                onClick={() => onOpen(r)}
                className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left hover:border-sparrow-rule dark:hover:border-sparrow-dark-border hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2"
              >
                <div className="w-10 shrink-0 font-mono text-xs text-sparrow-gray/70">
                  <span className="block text-base font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">{day}</span>
                  {weekday}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{r.title}</p>
                  <p className="truncate text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{r.sub}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                    r.badge === 'Your notes' ? 'bg-sparrow-green/10 text-sparrow-green dark:text-sparrow-dark-green' : 'bg-sparrow-gold/15 text-amber-700'
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
        <div className="mt-2 border-t border-sparrow-rule dark:border-sparrow-dark-border pt-3 text-center">
          <button onClick={onShowAll} className="text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-green dark:hover:text-sparrow-dark-green">
            See notes older than 3 months
          </button>
        </div>
      )}
    </div>
  );
}

function IdeasTab({ userId }: { userId: string }) {
  const [scope, setScope] = useState<'mine' | 'team'>('mine');
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [teamIdeas, setTeamIdeas] = useState<Idea[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([fetchMyIdeas(userId), fetchTeamIdeas(), fetchProfiles()])
      .then(([mine, team, profs]) => {
        setIdeas(mine);
        setTeamIdeas(team);
        setProfiles(profs);
      })
      .finally(() => setLoading(false));
  }, [userId]);

  const authorName = (id: string) => profiles.find((p) => p.id === id)?.full_name ?? '—';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    setSubmitError(null);
    try {
      const created = await createIdea(userId, title.trim(), description.trim());
      setIdeas((prev) => [created, ...prev]);
      setTitle('');
      setDescription('');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not save this idea. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function toggle(idea: Idea) {
    const completed = !idea.completed_at;
    const patch = { completed_at: completed ? new Date().toISOString() : null };
    setIdeas((prev) => prev.map((i) => (i.id === idea.id ? { ...i, ...patch } : i)));
    setTeamIdeas((prev) => prev.map((i) => (i.id === idea.id ? { ...i, ...patch } : i)));
    await setIdeaCompleted(idea.id, completed);
  }

  async function remove(idea: Idea) {
    setIdeas((prev) => prev.filter((i) => i.id !== idea.id));
    setTeamIdeas((prev) => prev.filter((i) => i.id !== idea.id));
    await deleteIdea(idea.id);
  }

  async function share(idea: Idea, shared: boolean) {
    setIdeas((prev) => prev.map((i) => (i.id === idea.id ? { ...i, shared } : i)));
    setTeamIdeas((prev) => (shared ? [{ ...idea, shared }, ...prev] : prev.filter((i) => i.id !== idea.id)));
    await setIdeaShared(idea.id, shared);
  }

  const active = ideas.filter((i) => !i.completed_at);
  const done = ideas.filter((i) => i.completed_at);
  const teamActive = teamIdeas.filter((i) => !i.completed_at);
  const teamDone = teamIdeas.filter((i) => i.completed_at);

  function Row({ idea, mine }: { idea: Idea; mine: boolean }) {
    return (
      <div className="group flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2">
        <input
          type="checkbox"
          checked={Boolean(idea.completed_at)}
          onChange={() => (mine ? void toggle(idea) : undefined)}
          disabled={!mine}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-sparrow-rule dark:border-sparrow-dark-border text-sparrow-green dark:text-sparrow-dark-green focus:ring-sparrow-green dark:focus:ring-sparrow-dark-green disabled:cursor-default"
        />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${idea.completed_at ? 'text-sparrow-gray dark:text-sparrow-dark-gray line-through' : 'text-sparrow-ink dark:text-sparrow-dark-ink'}`}>
            {idea.title}
          </p>
          {idea.description && (
            <p className={`mt-0.5 text-xs ${idea.completed_at ? 'text-sparrow-gray/70 line-through' : 'text-sparrow-gray dark:text-sparrow-dark-gray'}`}>
              {idea.description}
            </p>
          )}
          <p className="mt-1 text-[11px] text-sparrow-gray/60">
            {mine ? `Added ${formatDate(idea.created_at)}` : `${authorName(idea.created_by)} · ${formatDate(idea.created_at)}`}
          </p>
        </div>
        {mine && (
          <>
            <button
              onClick={() => void share(idea, !idea.shared)}
              title={idea.shared ? 'Shared with the team — click to make private' : 'Share with the team'}
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium opacity-0 group-hover:opacity-100 ${
                idea.shared ? 'bg-sparrow-sage dark:bg-sparrow-green/15 text-sparrow-green dark:text-sparrow-dark-green opacity-100' : 'border border-sparrow-rule dark:border-sparrow-dark-border text-sparrow-gray dark:text-sparrow-dark-gray'
              }`}
            >
              {idea.shared ? 'Shared ✓' : 'Share'}
            </button>
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
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="mb-5 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Idea title"
          className="w-full border-none bg-white dark:bg-sparrow-dark-surface p-1 text-sm font-semibold outline-none placeholder:font-normal placeholder:text-sparrow-gray/60"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add more detail (optional)"
          rows={2}
          className="w-full resize-none border-none bg-white dark:bg-sparrow-dark-surface p-1 text-sm text-sparrow-gray dark:text-sparrow-dark-gray outline-none placeholder:text-sparrow-gray/60"
        />
        <div className="mt-1 flex items-center justify-between gap-3 border-t border-dashed border-sparrow-rule dark:border-sparrow-dark-border pt-2">
          {!title.trim() ? (
            <p className="text-xs text-sparrow-gray/70">Add a title to save this idea.</p>
          ) : submitError ? (
            <p className="text-xs text-priority-p1">{submitError}</p>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={!title.trim() || saving}
            className="shrink-0 rounded-lg bg-sparrow-green px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add idea'}
          </button>
        </div>
      </form>

      <div className="mb-3 inline-flex rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-1">
        {(['mine', 'team'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              scope === s ? 'bg-sparrow-green text-white' : 'text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink'
            }`}
          >
            {s === 'mine' ? 'My Ideas' : `Team Ideas${teamIdeas.length > 0 ? ` · ${teamIdeas.length}` : ''}`}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading…</p>
      ) : scope === 'mine' ? (
        ideas.length === 0 ? (
          <p className="py-8 text-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
            Nothing here yet — drop a quick idea above any time one comes to you.
          </p>
        ) : (
          <>
            {active.map((idea) => (
              <Row key={idea.id} idea={idea} mine />
            ))}
            {done.length > 0 && (
              <>
                <p className="mt-3 border-t border-sparrow-rule dark:border-sparrow-dark-border pt-3 text-xs font-semibold uppercase tracking-wide text-sparrow-gray/70">
                  Checked off
                </p>
                {done.map((idea) => (
                  <Row key={idea.id} idea={idea} mine />
                ))}
              </>
            )}
          </>
        )
      ) : teamIdeas.length === 0 ? (
        <p className="py-8 text-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
          No shared ideas yet — hover one of your own ideas and click "Share" to put it here.
        </p>
      ) : (
        <>
          {teamActive.map((idea) => (
            <Row key={idea.id} idea={idea} mine={idea.created_by === userId} />
          ))}
          {teamDone.length > 0 && (
            <>
              <p className="mt-3 border-t border-sparrow-rule dark:border-sparrow-dark-border pt-3 text-xs font-semibold uppercase tracking-wide text-sparrow-gray/70">
                Checked off
              </p>
              {teamDone.map((idea) => (
                <Row key={idea.id} idea={idea} mine={idea.created_by === userId} />
              ))}
            </>
          )}
        </>
      )}

      <p className="mt-6 text-xs text-sparrow-gray/70">
        {scope === 'mine'
          ? 'Private by default — hover an idea and click "Share" to put it in Team Ideas for everyone to see.'
          : 'Visible to all staff. Only the person who wrote each idea can check it off or delete it.'}
      </p>
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
  const [openRow, setOpenRow] = useState<NoteRow | null>(null);

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
    noteId: n.noteId,
    event: n.event,
    title: n.title,
    startsAt: n.startsAt,
    scope: 'private',
    badge: 'Your notes',
    sub: `Updated ${formatDate(n.updated_at)}`,
  }));
  const sharedRows: NoteRow[] = sharedNotes.map((n) => ({
    noteId: n.noteId,
    event: n.event,
    title: n.title,
    startsAt: n.startsAt,
    scope: 'shared',
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
        <p className="mt-1 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Everything you've written or been sent, in one place.</p>
      </div>

      <div className="mb-5 inline-flex rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
              tab === t.id ? 'bg-sparrow-green text-white' : 'text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'ideas' && loading ? (
        <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading…</p>
      ) : tab === 'mine' ? (
        <NoteList
          rows={myRows}
          search={mySearch}
          onSearch={setMySearch}
          showAll={myShowAll}
          onShowAll={() => setMyShowAll(true)}
          onOpen={setOpenRow}
          emptyLabel="You haven't written any notes yet — open an event from the calendar and click Notes to start one."
        />
      ) : tab === 'shared' ? (
        <NoteList
          rows={sharedRows}
          search={sharedSearch}
          onSearch={setSharedSearch}
          showAll={sharedShowAll}
          onShowAll={() => setSharedShowAll(true)}
          onOpen={setOpenRow}
          emptyLabel="No shared notes yet on events you're attending."
        />
      ) : (
        <IdeasTab userId={profile.id} />
      )}

      {openRow?.event && (
        <MeetingNotesView event={openRow.event} userId={profile.id} onClose={() => setOpenRow(null)} />
      )}
      {openRow && !openRow.event && (
        <OrphanedNoteView
          noteId={openRow.noteId}
          scope={openRow.scope}
          title={openRow.title}
          startsAt={openRow.startsAt}
          onClose={() => setOpenRow(null)}
        />
      )}
    </div>
  );
}
