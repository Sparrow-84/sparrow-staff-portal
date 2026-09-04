import { useEffect, useMemo, useRef, useState } from 'react';
import type { StoryParticipant } from '@/lib/stories';

interface Props {
  participants: StoryParticipant[];
  value: string | null; // household_adult_id
  onChange: (adultId: string | null) => void;
  id?: string;
  placeholder?: string;
}

// Shared "who is this about" dropdown for the Stories tab and the Photo &
// Media Release tab. Active participants show by default; searching also
// reaches past/graduated ones, so an old entry can still be logged or
// linked without needing to hunt through a huge always-on list.
export function ParticipantPicker({ participants, value, onChange, id, placeholder = 'Search participants…' }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = participants.find((p) => p.adult_id === value) ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pool = q ? participants : participants.filter((p) => p.active);
    const matches = q
      ? pool.filter((p) => p.full_name.toLowerCase().includes(q) || p.family_display_name.toLowerCase().includes(q))
      : pool;
    return [...matches].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.full_name.localeCompare(b.full_name);
    });
  }, [participants, search]);

  function select(adultId: string | null) {
    onChange(adultId);
    setOpen(false);
    setSearch('');
  }

  return (
    <div ref={wrapRef} className="relative">
      <button type="button" id={id} onClick={() => setOpen((o) => !o)} className="field-input text-left">
        {selected ? (
          <>
            {selected.full_name}{' '}
            <span className="text-sparrow-gray dark:text-sparrow-dark-gray">
              ({selected.family_display_name}
              {selected.active ? '' : ' — past'})
            </span>
          </>
        ) : (
          <span className="text-sparrow-gray dark:text-sparrow-dark-gray">— select a participant —</span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface shadow-xl">
          <div className="sticky top-0 border-b border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-2">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder}
              className="field-input py-1 text-sm"
            />
            <p className="mt-1 text-[11px] text-sparrow-gray dark:text-sparrow-dark-gray">
              {search ? 'Searching everyone, including past participants.' : 'Showing active participants — search to find someone past.'}
            </p>
          </div>
          <ul className="py-1">
            {value && (
              <li>
                <button
                  type="button"
                  onClick={() => select(null)}
                  className="flex w-full items-center px-3 py-2 text-left text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2"
                >
                  Clear selection
                </button>
              </li>
            )}
            {filtered.map((p) => (
              <li key={p.adult_id}>
                <button
                  type="button"
                  onClick={() => select(p.adult_id)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2"
                >
                  <span className="truncate text-sparrow-ink dark:text-sparrow-dark-ink">
                    {p.full_name} <span className="text-sparrow-gray dark:text-sparrow-dark-gray">({p.family_display_name})</span>
                  </span>
                  {!p.active && <span className="shrink-0 text-[10px] uppercase text-sparrow-gray dark:text-sparrow-dark-gray">Past</span>}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                {search ? 'No matches.' : 'No active participants.'}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
