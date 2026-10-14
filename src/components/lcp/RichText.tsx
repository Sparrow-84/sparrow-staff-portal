import { useEffect, useReducer, useRef } from 'react';
import { sanitizeRichText } from '@/lib/sanitize';

// How many steps back Undo can go (and Redo can replay). Cheap to keep high —
// these are just short HTML strings -- so err on the side of more insurance.
const HISTORY_LIMIT = 10;

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
  toolbar = false,
}: {
  initialValue: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeightRem?: number;
  /** Show Bold/Italic/Bullet-list/Undo/Redo buttons above the field. */
  toolbar?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Own undo/redo stack -- deliberately not relying on the browser's native
  // contentEditable undo, which is unreliable once execCommand (Bold/Italic/
  // Bullet) has touched the field. lastCommitted is "what the field looked
  // like after the most recent change we accepted" -- every commit() pushes
  // that prior value onto undo before overwriting it, so the entry sitting on
  // top of the stack right after any edit (including an accidental
  // select-all-and-overwrite) is always the full content from just before it.
  const lastCommittedRef = useRef(initialValue);
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  // Undo/Redo button enabled-state is read from the refs above (not re-render
  // state) -- this just forces that read to happen after each change.
  const [, bumpHistory] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = initialValue;
    lastCommittedRef.current = initialValue;
    undoStackRef.current = [];
    redoStackRef.current = [];
    // Intentionally mount-only — see note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function commit() {
    if (!ref.current) return;
    const next = sanitizeRichText(ref.current.innerHTML);
    if (next === lastCommittedRef.current) return;
    undoStackRef.current = [lastCommittedRef.current, ...undoStackRef.current].slice(0, HISTORY_LIMIT);
    redoStackRef.current = []; // a fresh edit invalidates whatever redo history there was
    lastCommittedRef.current = next;
    onChange(next);
    bumpHistory();
  }

  // Applies a value from the undo/redo stack directly -- distinct from
  // commit() because this must NOT itself push onto undo (that would just
  // re-record the step we're undoing).
  function applyFromHistory(value: string) {
    if (ref.current) ref.current.innerHTML = value;
    lastCommittedRef.current = value;
    onChange(value);
  }

  function undo() {
    const [prev, ...rest] = undoStackRef.current;
    if (prev === undefined) return;
    redoStackRef.current = [lastCommittedRef.current, ...redoStackRef.current].slice(0, HISTORY_LIMIT);
    undoStackRef.current = rest;
    applyFromHistory(prev);
    bumpHistory();
  }

  function redo() {
    const [next, ...rest] = redoStackRef.current;
    if (next === undefined) return;
    undoStackRef.current = [lastCommittedRef.current, ...undoStackRef.current].slice(0, HISTORY_LIMIT);
    redoStackRef.current = rest;
    applyFromHistory(next);
    bumpHistory();
  }

  // Ctrl+Z / Cmd+Z and Ctrl+Shift+Z (or Ctrl+Y) drive our own stack instead of
  // the browser's native undo -- this is the muscle-memory path most people
  // reach for before ever looking at a toolbar button.
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' && e.key.toLowerCase() !== 'y') return;
    e.preventDefault();
    if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
      redo();
    } else {
      undo();
    }
  }

  // execCommand is deprecated but remains the only zero-dependency way to
  // drive contentEditable formatting -- onMouseDown+preventDefault keeps the
  // field's focus/selection intact so the command actually has something to
  // apply to (a plain onClick loses the selection to the button first).
  function format(command: 'bold' | 'italic' | 'insertUnorderedList') {
    ref.current?.focus();
    document.execCommand(command);
    commit();
  }

  return (
    <div>
      {toolbar && (
        <div
          // Sticky, not just docked at the top -- on a long note, the
          // buttons (Bullet list especially) need to stay reachable without
          // scrolling all the way back up to the start of the field and then
          // back down to where the cursor actually is. Pinned to the
          // viewport while any part of this field is in view; scrolls away
          // normally once the whole field has passed.
          className="sticky top-0 z-10 mb-1 flex items-center gap-1 bg-white/95 py-1 backdrop-blur-sm dark:bg-sparrow-dark-surface/95"
        >
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => format('bold')}
            title="Bold"
            className="rounded px-2 py-1 text-xs font-bold text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink dark:text-sparrow-dark-gray dark:hover:bg-sparrow-dark-surface2 dark:hover:text-sparrow-dark-ink"
          >
            B
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => format('italic')}
            title="Italic"
            className="rounded px-2 py-1 text-xs italic text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink dark:text-sparrow-dark-gray dark:hover:bg-sparrow-dark-surface2 dark:hover:text-sparrow-dark-ink"
          >
            I
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => format('insertUnorderedList')}
            title="Bullet list"
            className="rounded px-2 py-1 text-xs text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink dark:text-sparrow-dark-gray dark:hover:bg-sparrow-dark-surface2 dark:hover:text-sparrow-dark-ink"
          >
            • List
          </button>
          <span className="mx-1 h-4 w-px bg-sparrow-rule dark:bg-sparrow-dark-border" />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={undo}
            disabled={undoStackRef.current.length === 0}
            title="Undo (Ctrl+Z)"
            className="rounded px-2 py-1 text-xs text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink disabled:pointer-events-none disabled:opacity-30 dark:text-sparrow-dark-gray dark:hover:bg-sparrow-dark-surface2 dark:hover:text-sparrow-dark-ink"
          >
            ↶ Undo
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={redo}
            disabled={redoStackRef.current.length === 0}
            title="Redo (Ctrl+Shift+Z)"
            className="rounded px-2 py-1 text-xs text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink disabled:pointer-events-none disabled:opacity-30 dark:text-sparrow-dark-gray dark:hover:bg-sparrow-dark-surface2 dark:hover:text-sparrow-dark-ink"
          >
            ↷ Redo
          </button>
        </div>
      )}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={commit}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        data-placeholder={placeholder}
        className="rich-text rich-text-editor"
        style={{ minHeight: `${minHeightRem}rem` }}
      />
    </div>
  );
}

export function RichTextView({ html, empty, className }: { html: string | null; empty?: string; className?: string }) {
  if (!html) {
    return empty ? <p className="text-sm italic text-sparrow-gray dark:text-sparrow-dark-gray">{empty}</p> : null;
  }
  return <div className={`rich-text ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

const LOOKS_LIKE_HTML = /<[a-z][\s\S]*>/i;

// A textarea's HTML parsing treats its content as raw text (RCDATA) -- any
// "<...>" stays literal instead of becoming real elements -- while still
// decoding character references like &nbsp;/&amp;. That makes it a safe way
// to undo stray entities (e.g. a pasted non-breaking space that got
// re-serialized as literal "&nbsp;" text -- see feedback-rich-text-staff-vs-participant)
// without risking real markup injection.
function decodeEntities(text: string): string {
  const el = document.createElement('textarea');
  el.innerHTML = text;
  return el.value;
}

/** Plain one-line text for previews (list rows, truncated summaries) --
 *  strips tags rather than rendering them, since a preview line has no room
 *  for real formatting anyway. */
export function stripHtml(text: string): string {
  if (!LOOKS_LIKE_HTML.test(text)) return decodeEntities(text);
  const div = document.createElement('div');
  div.innerHTML = text;
  return (div.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** For a field that used to store plain text and only recently switched to storing
 *  HTML from a rich text editor (e.g. after adding formatting to an existing plain
 *  textarea) -- older rows have literal newlines, which dangerouslySetInnerHTML
 *  would silently collapse. Falls back to whitespace-pre-wrap for anything that
 *  doesn't already look like it contains real tags. Runs that plain-text fallback
 *  through decodeEntities first -- otherwise a stray "&nbsp;" (no real tag around
 *  it, so it never reaches the HTML branch) prints as literal garbled characters
 *  instead of the space it was meant to be. */
export function RichOrPlainView({ text, empty, className }: { text: string | null; empty?: string; className?: string }) {
  if (!text) {
    return empty ? <p className="text-sm italic text-sparrow-gray dark:text-sparrow-dark-gray">{empty}</p> : null;
  }
  if (LOOKS_LIKE_HTML.test(text)) return <RichTextView html={text} className={className} />;
  return <p className={`whitespace-pre-wrap text-sm text-sparrow-ink dark:text-sparrow-dark-ink ${className ?? ''}`}>{decodeEntities(text)}</p>;
}
