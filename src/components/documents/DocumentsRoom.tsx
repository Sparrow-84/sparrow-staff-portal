import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchOrgDocuments } from '@/lib/documents';
import type { OrgDocument } from '@/lib/documents-types';

export function DocumentsRoom() {
  const [docs, setDocs] = useState<OrgDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDocs(await fetchOrgDocuments());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load documents.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Group by category, preserving sort order within each group
  const grouped = useMemo(() => {
    const map = new Map<string, OrgDocument[]>();
    for (const doc of docs) {
      if (!map.has(doc.category)) map.set(doc.category, []);
      map.get(doc.category)!.push(doc);
    }
    return map;
  }, [docs]);

  if (loading) return <p className="p-8 text-sm text-sparrow-gray">Loading documents…</p>;
  if (error) return <p className="p-8 text-sm text-priority-p1">{error}</p>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="font-serif text-2xl font-semibold">Documents</h1>
        <p className="mt-1 text-sm text-sparrow-gray">
          Reference documents for Sparrow staff. Come back here any time you need to look something up.
        </p>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sparrow-rule bg-white px-8 py-12 text-center">
          <p className="font-medium text-sparrow-ink">Documents coming soon</p>
          <p className="mt-1 text-sm text-sparrow-gray">
            The handbook, policy manual, and other reference docs will be added here before onboarding begins.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {[...grouped.entries()].map(([category, items]) => (
            <section key={category}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
                {category}
              </h2>
              <ul className="space-y-2">
                {items.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-start gap-4 rounded-2xl border border-sparrow-rule bg-white p-4 shadow-card"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sparrow-ink">{doc.title}</p>
                      {doc.description && (
                        <p className="mt-0.5 text-sm text-sparrow-gray">{doc.description}</p>
                      )}
                    </div>
                    {doc.url ? (
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 rounded-lg border border-sparrow-green px-3 py-1.5 text-sm font-medium text-sparrow-green transition hover:bg-sparrow-sage"
                      >
                        Open ↗
                      </a>
                    ) : (
                      <span className="shrink-0 rounded-full bg-sparrow-rule/60 px-2.5 py-1 text-xs text-sparrow-gray">
                        Coming soon
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
