import { useEffect, useState } from 'react';
import {
  AREA_COLOR_CLASS,
  GOAL_AREAS,
  GOAL_AREA_LABEL,
  SESSION_LOG_LABEL,
  type Family,
  type Goal,
  type Homework,
  type SessionLogType,
  type StaffNoteWithSession,
} from '@/lib/lcp-types';
import { fetchGoalsForFamily, fetchHomeworkForFamily, fetchStaffNotesWithSession } from '@/lib/lcp';
import { dayLabel } from '@/lib/lcp-format';

// Distinct colors per note category, consistent with the Monday filing panel's
// bucket colors — lets staff spot which type a note is at a glance.
const CATEGORY_BADGE: Record<'finance' | 'life_skills' | 'mentoring' | 'thursday_group', string> = {
  finance: 'bg-[#2F6B4F]/15 text-[#2F6B4F]',
  life_skills: 'bg-[#B8790A]/15 text-[#8A5C08]',
  mentoring: 'bg-[#7A5980]/15 text-[#7A5980]',
  thursday_group: 'bg-[#3E6580]/15 text-[#3E6580]',
};

function categoryFor(note: StaffNoteWithSession): keyof typeof CATEGORY_BADGE | null {
  if (note.bucket) return note.bucket;
  if (note.session_log_type === 'thursday_group') return 'thursday_group';
  return null;
}

function categoryLabel(note: StaffNoteWithSession): string {
  if (note.bucket === 'finance') return 'Finance';
  if (note.bucket === 'life_skills') return 'Life Skills';
  if (note.bucket === 'mentoring') return 'Mentoring';
  if (note.session_log_type) return SESSION_LOG_LABEL[note.session_log_type];
  return 'Note';
}

function NoteCard({ note }: { note: StaffNoteWithSession }) {
  const [expanded, setExpanded] = useState(false);
  const cat = categoryFor(note);
  const isLong = note.body.length > 180;
  return (
    <div className="border-t border-sparrow-rule/70 py-3 first:border-t-0 first:pt-0">
      <div className="mb-1 flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cat ? CATEGORY_BADGE[cat] : 'text-sparrow-gray dark:text-sparrow-dark-gray'}`}>
          {categoryLabel(note)}
        </span>
        <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{dayLabel(note.created_at)}</span>
      </div>
      <p className={`text-sm text-sparrow-ink dark:text-sparrow-dark-ink ${!expanded ? 'line-clamp-3' : ''}`}>{note.body}</p>
      {isLong && (
        <button onClick={() => setExpanded((v) => !v)} className="mt-1 text-xs font-semibold text-sparrow-green dark:text-sparrow-dark-green">
          {expanded ? 'See less' : 'See more'}
        </button>
      )}
    </div>
  );
}

type Subtab = 'notes' | 'goals' | 'homework';

interface DisplayItem {
  id: string;
  title: string;
  assignedAt: string;
  completedAt: string | null;
}

// Active items always sort above completed ones (so a fresh goal never sits
// under an old finished one), then most-recent-first within each group.
function sortDisplay(items: DisplayItem[]): DisplayItem[] {
  return [...items].sort((a, b) => {
    const aDone = !!a.completedAt;
    const bDone = !!b.completedAt;
    if (aDone !== bDone) return aDone ? 1 : -1;
    const aKey = a.completedAt ?? a.assignedAt;
    const bKey = b.completedAt ?? b.assignedAt;
    return bKey.localeCompare(aKey);
  });
}

// One line per item (not one line per action) — a status circle (green ✓ once
// done, grey/empty while open), the title (struck through once complete), and
// a single "Assigned [date]" / "Completed [date]" line — same wording whether
// it's a goal or a piece of homework. No per-row category badge here — the
// group header above already names the category.
function GoalHomeworkRow({ title, assignedAt, completedAt }: { title: string; assignedAt: string; completedAt: string | null }) {
  const done = !!completedAt;
  return (
    <div className="flex items-center gap-2 border-t border-sparrow-rule/70 py-2.5 first:border-t-0 first:pt-0">
      <span
        className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
          done ? 'bg-sparrow-green text-white' : 'bg-sparrow-mist dark:bg-sparrow-dark-surface2 text-sparrow-gray dark:text-sparrow-dark-gray'
        }`}
      >
        {done ? '✓' : ''}
      </span>
      <span className={`min-w-0 flex-1 truncate text-sm ${done ? 'text-sparrow-gray dark:text-sparrow-dark-gray line-through' : 'text-sparrow-ink dark:text-sparrow-dark-ink'}`}>{title}</span>
      <span className="shrink-0 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
        {done ? `Completed ${dayLabel(completedAt)}` : `Assigned ${dayLabel(assignedAt)}`}
      </span>
    </div>
  );
}

// A category of goals or homework — up to 5 shown, most-recent-first, but an
// active (unchecked) item is never hidden behind "Show more" even past 5;
// only completed items get pushed behind the button.
function CategoryGroup({ label, colorClass, items }: { label: string; colorClass: string; items: DisplayItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const sorted = sortDisplay(items);
  const activeCount = sorted.filter((i) => !i.completedAt).length;
  const visibleCount = expanded ? sorted.length : Math.max(5, activeCount);
  const visible = sorted.slice(0, visibleCount);
  const hiddenCount = sorted.length - visible.length;

  return (
    <div className="mb-4">
      <span className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${colorClass}`}>{label}</span>
      {visible.map((item) => (
        <GoalHomeworkRow key={item.id} title={item.title} assignedAt={item.assignedAt} completedAt={item.completedAt} />
      ))}
      {hiddenCount > 0 && (
        <button onClick={() => setExpanded(true)} className="mt-1 text-xs font-semibold text-sparrow-green dark:text-sparrow-dark-green">
          Show {hiddenCount} more
        </button>
      )}
    </div>
  );
}

const SESSION_TYPE_ORDER: SessionLogType[] = ['monday_mentoring', 'thursday_group', 'ad_hoc'];

export function SessionLogByParticipant({ families }: { families: Family[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(families[0]?.id ?? null);
  const [subtab, setSubtab] = useState<Subtab>('notes');
  const [notes, setNotes] = useState<StaffNoteWithSession[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [homework, setHomework] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchStaffNotesWithSession(selectedId),
      fetchGoalsForFamily(selectedId),
      fetchHomeworkForFamily(selectedId),
    ]).then(([ns, gl, hw]) => {
      if (cancelled) return;
      setNotes(ns);
      setGoals(gl);
      setHomework(hw);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selected = families.find((f) => f.id === selectedId) ?? null;

  return (
    <div className="grid gap-3 sm:grid-cols-[15rem_1fr]">
      <div className="overflow-hidden rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface">
        {families.map((f) => (
          <button
            key={f.id}
            onClick={() => setSelectedId(f.id)}
            className={`block w-full border-t border-sparrow-rule dark:border-sparrow-dark-border px-3.5 py-3 text-left text-sm first:border-t-0 ${
              f.id === selectedId ? 'border-l-4 border-l-sparrow-green bg-sparrow-sage/60 dark:bg-sparrow-green/15' : 'border-l-4 border-l-transparent hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2'
            }`}
          >
            <p className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{f.display_name}</p>
          </button>
        ))}
      </div>

      <div className="min-h-[20rem] rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4">
        {selected && <h3 className="mb-2 font-serif text-lg font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">{selected.display_name}</h3>}

        <div className="mb-3 inline-flex gap-0.5 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-1">
          {(['notes', 'goals', 'homework'] as Subtab[]).map((t) => (
            <button
              key={t}
              onClick={() => setSubtab(t)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition ${
                subtab === t ? 'bg-white dark:bg-sparrow-dark-surface text-sparrow-green dark:text-sparrow-dark-green shadow-sm' : 'text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading…</p>
        ) : subtab === 'notes' ? (
          notes.length === 0 ? <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No notes yet.</p> : notes.map((n) => <NoteCard key={n.id} note={n} />)
        ) : subtab === 'goals' ? (
          goals.length === 0 ? (
            <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No goals yet.</p>
          ) : (
            GOAL_AREAS.filter((area) => goals.some((g) => g.area === area)).map((area) => (
              <CategoryGroup
                key={area}
                label={GOAL_AREA_LABEL[area]}
                colorClass={AREA_COLOR_CLASS[area]}
                items={goals
                  .filter((g) => g.area === area)
                  .map((g) => ({ id: g.id, title: g.title, assignedAt: g.created_at, completedAt: g.met_at }))}
              />
            ))
          )
        ) : homework.length === 0 ? (
          <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No homework yet.</p>
        ) : (
          SESSION_TYPE_ORDER.filter((t) => homework.some((h) => h.session_type === t)).map((t) => (
            <CategoryGroup
              key={t}
              label={SESSION_LOG_LABEL[t]}
              colorClass="bg-sparrow-mist dark:bg-sparrow-dark-surface2 text-sparrow-gray dark:text-sparrow-dark-gray"
              items={homework
                .filter((h) => h.session_type === t)
                .map((h) => ({ id: h.id, title: h.title, assignedAt: h.created_at, completedAt: h.completed_at }))}
            />
          ))
        )}
        {subtab === 'homework' && homework.length > 0 && homework.some((h) => !h.session_type) && (
          <CategoryGroup
            label="Unspecified"
            colorClass="bg-sparrow-mist dark:bg-sparrow-dark-surface2 text-sparrow-gray dark:text-sparrow-dark-gray"
            items={homework
              .filter((h) => !h.session_type)
              .map((h) => ({ id: h.id, title: h.title, assignedAt: h.created_at, completedAt: h.completed_at }))}
          />
        )}
      </div>
    </div>
  );
}

// Also exported for the By Monday Type view — same category color logic, applied
// to a bucket-scoped feed instead of a family-scoped one.
export function BucketNoteCard({ note, families }: { note: StaffNoteWithSession; families: Family[] }) {
  const [expanded, setExpanded] = useState(false);
  const family = families.find((f) => f.id === note.family_id);
  const isLong = note.body.length > 180;
  return (
    <div className="border-t border-sparrow-rule/70 py-3 first:border-t-0 first:pt-0">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-bold text-sparrow-gray dark:text-sparrow-dark-gray">{family?.display_name ?? 'Unknown family'}</span>
        <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{dayLabel(note.created_at)}</span>
      </div>
      <p className={`text-sm text-sparrow-ink dark:text-sparrow-dark-ink ${!expanded ? 'line-clamp-3' : ''}`}>{note.body}</p>
      {isLong && (
        <button onClick={() => setExpanded((v) => !v)} className="mt-1 text-xs font-semibold text-sparrow-green dark:text-sparrow-dark-green">
          {expanded ? 'See less' : 'See more'}
        </button>
      )}
    </div>
  );
}
