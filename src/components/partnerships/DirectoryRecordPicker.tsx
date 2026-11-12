// Pick an existing Directory record by typing part of its name. Used when a Meaningful
// Connection belongs to an organization that's already in the Directory. The search starts
// with the connection's organization, so the likely match is usually already showing.
import { useEffect, useMemo, useState } from 'react';
import { fetchDirectoryRecordNames } from '@/lib/partnerships-tabs';

let cache: { id: string; name: string }[] | null = null;

export function DirectoryRecordPicker({
  value,
  onChange,
  initialSearch,
  disabled,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  /** Usually the connection's organization. */
  initialSearch?: string | null;
  disabled?: boolean;
}) {
  const [records, setRecords] = useState<{ id: string; name: string }[]>(cache ?? []);
  const [search, setSearch] = useState(initialSearch ?? '');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (cache) return;
    fetchDirectoryRecordNames()
      .then((rows) => { cache = rows; setRecords(rows); })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not load the Directory.'));
  }, []);

  const selected = records.find((r) => r.id === value) ?? null;
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return records.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 8);
  }, [records, search]);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-sparrow-green dark:border-sparrow-dark-green bg-sparrow-mist dark:bg-sparrow-dark-surface2 px-2.5 py-1.5">
        <span className="truncate text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{selected.name}</span>
        <button type="button" onClick={() => onChange(null)} disabled={disabled} className="shrink-0 text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink">
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Type the record's name…"
        className="field-input mt-0 w-full"
        disabled={disabled}
      />
      {loadError && <p className="text-xs text-priority-p1">{loadError}</p>}
      {matches.length > 0 && (
        <ul className="max-h-48 overflow-y-auto rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface">
          {matches.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onChange(r.id)}
                disabled={disabled}
                className="w-full px-2.5 py-1.5 text-left text-sm text-sparrow-ink dark:text-sparrow-dark-ink hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2"
              >
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {search.trim() && matches.length === 0 && records.length > 0 && (
        <p className="text-[11px] text-sparrow-gray dark:text-sparrow-dark-gray">No Directory record matches. Try another spelling, or use Add to Directory instead.</p>
      )}
    </div>
  );
}
