import { useEffect, useRef } from 'react';
import { sanitizeRichText } from '@/lib/sanitize';

// Paste-formatted-content field: paste from Google Docs, a rendered Claude
// reply, etc. and the real bold/headings/tables/quotes come in with it —
// sanitized on every change so only structure survives, not exact fonts/colors.
// Uncontrolled by design: the DOM owns the live content once mounted (avoids
// fighting the browser's own cursor position on every keystroke). The parent
// forces a fresh mount with a `key` whenever it's showing a different record.
export function RichTextField({
  initialValue,
  onChange,
  placeholder,
  minHeightRem = 8,
}: {
  initialValue: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeightRem?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = initialValue;
    // Intentionally mount-only — see note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function commit() {
    if (!ref.current) return;
    onChange(sanitizeRichText(ref.current.innerHTML));
  }

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onInput={commit}
      onBlur={commit}
      data-placeholder={placeholder}
      className="rich-text rich-text-editor"
      style={{ minHeight: `${minHeightRem}rem` }}
    />
  );
}

export function RichTextView({ html, empty }: { html: string | null; empty?: string }) {
  if (!html) {
    return empty ? <p className="text-sm italic text-sparrow-gray">{empty}</p> : null;
  }
  return <div className="rich-text" dangerouslySetInnerHTML={{ __html: html }} />;
}
