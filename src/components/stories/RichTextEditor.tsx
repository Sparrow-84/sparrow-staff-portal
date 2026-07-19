import { useEffect, useRef } from 'react';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

// Matches MeetingNotesView CONTENT_CLASSES pattern exactly.
const CONTENT_CLASSES =
  'min-h-48 p-3 text-sm leading-relaxed text-sparrow-ink focus:outline-none ' +
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 ' +
  '[&_li]:mb-0.5 [&_b]:font-semibold [&_strong]:font-semibold [&_p]:mb-2';

function Toolbar() {
  function apply(cmd: string) {
    document.execCommand(cmd, false, undefined);
  }
  return (
    <div className="flex items-center gap-0.5 border-b border-sparrow-rule bg-sparrow-mist/40 px-2 py-1">
      <button
        onMouseDown={(e) => { e.preventDefault(); apply('bold'); }}
        className="rounded px-2 py-0.5 text-sm font-bold text-sparrow-ink hover:bg-sparrow-mist"
        title="Bold (Ctrl+B)"
        type="button"
      >
        B
      </button>
      <button
        onMouseDown={(e) => { e.preventDefault(); apply('italic'); }}
        className="rounded px-2 py-0.5 text-sm italic text-sparrow-ink hover:bg-sparrow-mist"
        title="Italic (Ctrl+I)"
        type="button"
      >
        I
      </button>
      <div className="mx-1 h-3.5 w-px bg-sparrow-rule" />
      <button
        onMouseDown={(e) => { e.preventDefault(); apply('insertUnorderedList'); }}
        className="rounded px-2 py-0.5 text-sm text-sparrow-ink hover:bg-sparrow-mist"
        title="Bullet list"
        type="button"
      >
        • List
      </button>
    </div>
  );
}

/**
 * Reusable rich text editor using the contentEditable + document.execCommand pattern
 * from MeetingNotesView.tsx.
 *
 * The parent should pass a `key` that changes when a different record is loaded
 * (e.g. `key={story?.id ?? 'new'}`). This causes React to remount the editor,
 * which re-runs the initialisation effect with the new value — avoiding the need
 * for a complex two-way sync between `value` and the DOM's innerHTML.
 */
export function RichTextEditor({ value, onChange, placeholder, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Set innerHTML once on mount. Subsequent changes are driven by user input via
  // onInput → onChange. The parent resets by changing the React key.
  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = value;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleInput() {
    onChange(ref.current?.innerHTML ?? '');
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const html = e.nativeEvent.clipboardData?.getData('text/html');
    if (html) {
      const clean = html.replace(/ style="[^"]*"/g, '').replace(/ class="[^"]*"/g, '');
      document.execCommand('insertHTML', false, clean);
    } else {
      const text = e.nativeEvent.clipboardData?.getData('text/plain') ?? '';
      document.execCommand('insertText', false, text);
    }
  }

  return (
    <div className={`rounded-lg border border-sparrow-rule bg-white ${className ?? ''}`}>
      <Toolbar />
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        data-placeholder={placeholder}
        className={`${CONTENT_CLASSES} relative empty:before:pointer-events-none empty:before:text-sparrow-gray/60 empty:before:content-[attr(data-placeholder)]`}
      />
    </div>
  );
}
