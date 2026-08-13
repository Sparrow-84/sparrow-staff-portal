export function GrantsHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-sparrow-ink/40 px-4 py-12"
      onClick={onClose}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-sparrow-dark-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-sparrow-rule dark:border-sparrow-dark-border px-6 py-4">
          <h2 className="font-serif text-lg font-semibold">How the Grants module works</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-xl leading-none text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          <section className="rounded-xl bg-sparrow-mist/60 dark:bg-sparrow-dark-surface2 px-4 py-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">The 4 tabs</h3>
            <ul className="space-y-2 text-xs leading-relaxed text-sparrow-gray dark:text-sparrow-dark-gray">
              <li><strong className="text-sparrow-ink dark:text-sparrow-dark-ink">Active Grants</strong> — grants Sparrow currently holds, with ongoing compliance to track (certification dates, funder consent, notifications).</li>
              <li><strong className="text-sparrow-ink dark:text-sparrow-dark-ink">Being Pursued</strong> — leads still in motion: not yet researched, being researched, decided to pursue, or applied and waiting to hear back.</li>
              <li><strong className="text-sparrow-ink dark:text-sparrow-dark-ink">Not Moving Forward</strong> — leads that ended without funding, whether Sparrow chose not to apply or applied and was declined. Kept for the record of why.</li>
              <li><strong className="text-sparrow-ink dark:text-sparrow-dark-ink">Past Grants</strong> — Active Grants that have wrapped up. Every field, link, and document stays exactly as it was — nothing gets stripped out.</li>
            </ul>
          </section>

          <section className="rounded-xl bg-sparrow-mist/60 dark:bg-sparrow-dark-surface2 px-4 py-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Tier &amp; Source labels</h3>
            <p className="text-xs leading-relaxed text-sparrow-gray dark:text-sparrow-dark-gray">
              Custom, color-coded, and reusable — same idea as your task and calendar labels. Type one once,
              pick a color, and it's saved in the dropdown for every prospect after that. Shared across
              everyone with Grants access, not personal to one staff member.
            </p>
          </section>

          <section className="rounded-xl bg-sparrow-mist/60 dark:bg-sparrow-dark-surface2 px-4 py-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Applied → Awarded</h3>
            <p className="text-xs leading-relaxed text-sparrow-gray dark:text-sparrow-dark-gray">
              Applied means submitted and waiting to hear back — it stays in Being Pursued. Marking a prospect
              Awarded automatically creates a real Active Grant record, pre-filled with what you already know,
              and the prospect closes out with its research history intact.
            </p>
          </section>

          <section className="rounded-xl bg-sparrow-mist/60 dark:bg-sparrow-dark-surface2 px-4 py-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Prior consent required (Active Grants only)</h3>
            <p className="text-xs leading-relaxed text-sparrow-gray dark:text-sparrow-dark-gray">
              Check this if the funder's agreement says Sparrow must get their written OK before certain
              actions — commonly: selling/transferring the property, changing the management company, or
              taking on new debt against it.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
