import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchOrgDocuments } from '@/lib/documents';
import type { OrgDocument } from '@/lib/documents-types';
import { TabHelpModal } from '@/components/TabHelpModal';

const RESOURCE_HELP_SECTIONS = [
  {
    heading: "What's here",
    items: [
      { label: 'Staff handbook', desc: 'Sparrow policies, expectations, and how we work together. Start here if you have a question about a process.' },
      { label: 'Policies & procedures', desc: 'Board-approved policies. Reference for specific decisions, compliance questions, and staff conduct.' },
      { label: 'Job descriptions', desc: 'Official role descriptions for all positions.' },
      { label: 'Emergency procedures', desc: 'What to do and who to call in an emergency at Twin Oaks or at program sites.' },
      { label: 'Org chart', desc: 'Who reports to whom and how the team is structured.' },
    ],
    note: 'Documents are added and updated by leadership. If something is marked "Coming soon," check back as onboarding materials are finalized.',
  },
  {
    heading: 'How to use it',
    items: [
      { label: 'Open ↗', desc: 'Opens the document in a new tab — links to Google Drive or another file location. You may need to request access if the doc is restricted.' },
      { label: 'Categories', desc: 'Documents are grouped by category. Scroll down to see all sections.' },
    ],
  },
];

export function DocumentsRoom() {
  const [docs, setDocs] = useState<OrgDocument[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
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

  if (loading) return <p className="p-8 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading documents…</p>;
  if (error) return <p className="p-8 text-sm text-priority-p1">{error}</p>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <TabHelpModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Resource Library"
        intro="Staff reference documents, organized by category. Read-only — everyone works from the same version."
        sections={RESOURCE_HELP_SECTIONS}
      />
      <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Resource Library</h1>
          <p className="mt-1 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
            Reference documents for Sparrow staff. Come back here any time you need to look something up.
          </p>
        </div>
        <button
          onClick={() => setHelpOpen(true)}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-sparrow-rule dark:border-sparrow-dark-border text-sm font-semibold text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
          aria-label="Resource Library help"
          title="About the Resource Library"
        >
          ?
        </button>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface px-8 py-12 text-center">
          <p className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Documents coming soon</p>
          <p className="mt-1 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
            The handbook, policy manual, and other reference docs will be added here before onboarding begins.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {[...grouped.entries()].map(([category, items]) => (
            <section key={category}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">
                {category}
              </h2>
              <ul className="space-y-2">
                {items.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-start gap-4 rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4 shadow-card"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{doc.title}</p>
                      {doc.description && (
                        <p className="mt-0.5 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">{doc.description}</p>
                      )}
                    </div>
                    {doc.url ? (
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 rounded-lg border border-sparrow-green dark:border-sparrow-dark-green px-3 py-1.5 text-sm font-medium text-sparrow-green dark:text-sparrow-dark-green transition hover:bg-sparrow-sage dark:hover:bg-sparrow-green/15"
                      >
                        Open ↗
                      </a>
                    ) : (
                      <span className="shrink-0 rounded-full bg-sparrow-rule/60 px-2.5 py-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
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
