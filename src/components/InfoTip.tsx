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
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-sparrow-rule text-[10px] font-bold text-sparrow-gray hover:bg-sparrow-green hover:text-white"
      >
        ?
      </button>
      {open && (
        <span className="absolute left-0 top-5 z-10 w-64 rounded-lg border border-sparrow-rule bg-white p-2.5 text-xs font-normal leading-snug text-sparrow-ink shadow-card">
          {text}
        </span>
      )}
    </span>
  );
}
