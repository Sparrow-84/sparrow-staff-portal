import { useRef, useState } from 'react';

const TOOLTIP_WIDTH_PX = 256; // matches w-64

// Click-to-reveal helper text for fields that aren't self-explanatory to someone new
// to a module. A "?" rather than a hover title so it works on touch devices too.
export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<'left' | 'right'>('right');
  const anchorRef = useRef<HTMLSpanElement>(null);

  function toggle() {
    setOpen((o) => {
      const next = !o;
      if (next && anchorRef.current) {
        const rect = anchorRef.current.getBoundingClientRect();
        // Anchoring right-0 makes the tooltip extend leftward from the "?" — only safe
        // if there's actually room to its left. Near a panel's left edge, flip to
        // left-0 (extends rightward) instead, so it never runs off either side.
        setAlign(rect.right - TOOLTIP_WIDTH_PX < 8 ? 'left' : 'right');
      }
      return next;
    });
  }

  return (
    <span ref={anchorRef} className="relative inline-block">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label="What does this mean?"
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-sparrow-rule dark:bg-sparrow-dark-border text-[10px] font-bold text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-green hover:text-white"
      >
        ?
      </button>
      {open && (
        <span
          className={`absolute top-5 z-10 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-2.5 text-xs font-normal leading-snug text-sparrow-ink dark:text-sparrow-dark-ink shadow-card ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {text}
        </span>
      )}
    </span>
  );
}
