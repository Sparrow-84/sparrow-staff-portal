interface HelpItem {
  label: string;
  desc: string;
}

interface HelpSection {
  heading: string;
  items: HelpItem[];
  note?: string;
}

export function TabHelpModal({
  open,
  onClose,
  title,
  intro,
  sections,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  intro?: string;
  sections: HelpSection[];
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-sparrow-ink/40 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-sparrow-dark-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-sparrow-rule dark:border-sparrow-dark-border px-6 py-4">
          <h2 className="font-serif text-lg font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-xl leading-none text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="divide-y divide-sparrow-rule dark:divide-sparrow-dark-border">
          {intro && (
            <div className="px-6 py-4">
              <p className="text-sm leading-relaxed text-sparrow-gray dark:text-sparrow-dark-gray">{intro}</p>
            </div>
          )}

          {sections.map((s) => (
            <div key={s.heading} className="px-6 py-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">
                {s.heading}
              </p>
              <div className="space-y-3">
                {s.items.map((item) => (
                  <div key={item.label}>
                    <p className="text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{item.label}</p>
                    <p className="text-xs leading-relaxed text-sparrow-gray dark:text-sparrow-dark-gray">{item.desc}</p>
                  </div>
                ))}
              </div>
              {s.note && (
                <p className="mt-3 rounded-lg bg-sparrow-mist dark:bg-sparrow-dark-surface2 px-3 py-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                  {s.note}
                </p>
              )}
            </div>
          ))}

          <div className="flex justify-end px-6 py-4">
            <button onClick={onClose} className="btn-secondary text-sm">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
