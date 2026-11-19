import { useRef, useState } from 'react';

const TOOLTIP_WIDTH_PX = 256; // preferred width (w-64)
const EDGE_GAP_PX = 8;

/** The box the tooltip has to stay inside: the nearest ancestor that clips its overflow
 * (a side panel / drawer scroll area), else the window. Checking only the window wasn't
 * enough — inside a drawer on the right side of the screen there's plenty of window to
 * the "?"'s left, but the drawer's own edge cuts the tooltip off. */
function clipBounds(el: HTMLElement): { left: number; right: number } {
  let node = el.parentElement;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    if (/(auto|scroll|hidden|clip)/.test(style.overflowX + style.overflowY + style.overflow)) {
      const r = node.getBoundingClientRect();
      return { left: Math.max(r.left, 0), right: Math.min(r.right, window.innerWidth) };
    }
    node = node.parentElement;
  }
  return { left: 0, right: window.innerWidth };
}

// Click-to-reveal helper text for fields that aren't self-explanatory to someone new
// to a module. A "?" rather than a hover title so it works on touch devices too.
export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; width: number }>({ left: 0, width: TOOLTIP_WIDTH_PX });
  const anchorRef = useRef<HTMLSpanElement>(null);

  function toggle() {
    setOpen((o) => {
      const next = !o;
      if (next && anchorRef.current) {
        const anchor = anchorRef.current.getBoundingClientRect();
        const box = clipBounds(anchorRef.current);
        const width = Math.min(TOOLTIP_WIDTH_PX, box.right - box.left - EDGE_GAP_PX * 2);
        // Prefer extending leftward from the "?" (right edges lined up), then slide it
        // just enough to fit inside the box on both sides.
        let left = anchor.right - width;
        left = Math.min(left, box.right - EDGE_GAP_PX - width);
        left = Math.max(left, box.left + EDGE_GAP_PX);
        setPos({ left: left - anchor.left, width }); // relative to the "?" wrapper
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
          style={{ left: pos.left, width: pos.width }}
          className="absolute top-5 z-10 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-2.5 text-xs font-normal normal-case tracking-normal leading-snug text-sparrow-ink dark:text-sparrow-dark-ink shadow-card"
        >
          {text}
        </span>
      )}
    </span>
  );
}
