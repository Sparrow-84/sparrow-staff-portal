import { useEffect, useState } from 'react';
import { SESSION_LOG_LABEL, type Family, type StaffNoteWithSession } from '@/lib/lcp-types';
import { fetchStaffNotesWithSession } from '@/lib/lcp';
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
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cat ? CATEGORY_BADGE[cat] : 'text-sparrow-gray'}`}>
          {categoryLabel(note)}
        </span>
        <span className="text-xs text-sparrow-gray">{dayLabel(note.created_at)}</span>
      </div>
      <p className={`text-sm text-sparrow-ink ${!expanded ? 'line-clamp-3' : ''}`}>{note.body}</p>
      {isLong && (
        <button onClick={() => setExpanded((v) => !v)} className="mt-1 text-xs font-semibold text-sparrow-green">
          {expanded ? 'See less' : 'See more'}
        </button>
      )}
    </div>
  );
}

export function SessionLogByParticipant({ families }: { families: Family[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(families[0]?.id ?? null);
  const [notes, setNotes] = useState<StaffNoteWithSession[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoading(true);
    fetchStaffNotesWithSession(selectedId).then((ns) => {
      if (!cancelled) {
        setNotes(ns);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selected = families.find((f) => f.id === selectedId) ?? null;

  return (
    <div className="grid gap-3 sm:grid-cols-[15rem_1fr]">
      <div className="overflow-hidden rounded-2xl border border-sparrow-rule bg-white">
        {families.map((f) => (
          <button
            key={f.id}
            onClick={() => setSelectedId(f.id)}
            className={`block w-full border-t border-sparrow-rule px-3.5 py-3 text-left text-sm first:border-t-0 ${
              f.id === selectedId ? 'border-l-4 border-l-sparrow-green bg-sparrow-sage/60' : 'border-l-4 border-l-transparent hover:bg-sparrow-mist'
            }`}
          >
            <p className="font-medium text-sparrow-ink">{f.display_name}</p>
          </button>
        ))}
      </div>

      <div className="min-h-[20rem] rounded-2xl border border-sparrow-rule bg-white p-4">
        {selected && <h3 className="mb-2 font-serif text-lg font-semibold text-sparrow-ink">{selected.display_name}</h3>}
        {loading ? (
          <p className="text-sm text-sparrow-gray">Loading…</p>
        ) : notes.length === 0 ? (
          <p className="text-sm text-sparrow-gray">No notes yet.</p>
        ) : (
          notes.map((n) => <NoteCard key={n.id} note={n} />)
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
        <span className="text-xs font-bold text-sparrow-gray">{family?.display_name ?? 'Unknown family'}</span>
        <span className="text-xs text-sparrow-gray">{dayLabel(note.created_at)}</span>
      </div>
      <p className={`text-sm text-sparrow-ink ${!expanded ? 'line-clamp-3' : ''}`}>{note.body}</p>
      {isLong && (
        <button onClick={() => setExpanded((v) => !v)} className="mt-1 text-xs font-semibold text-sparrow-green">
          {expanded ? 'See less' : 'See more'}
        </button>
      )}
    </div>
  );
}
