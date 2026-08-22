import { useState } from 'react';

// Click-to-reveal helper text for fields that aren't self-explanatory to someone new
// to a module. A "?" rather than a hover title so it works on touch devices too.
export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="What does this mean?"
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-sparrow-rule dark:bg-sparrow-dark-border text-[10px] font-bold text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-green hover:text-white"
      >
        ?
      </button>
      {open && (
        <span className="absolute right-0 top-5 z-10 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-2.5 text-xs font-normal leading-snug text-sparrow-ink dark:text-sparrow-dark-ink shadow-card">
          {text}
        </span>
      )}
    </span>
  );
}
