import { useEffect, useRef, useState } from 'react';
import { GIVING_METHOD_PRESETS, isCustomGivingMethod } from '@/lib/partnerships-types';

/** Dropdown stays visible and pickable even while "Other" is active -- picking a different
 *  preset switches straight back, no separate undo needed. The describe field only exists
 *  while Other is selected, and tracks its own draft so typing isn't fighting the save
 *  round-trip on every keystroke (same pattern as GridTable's InlineText). */
export function GivingMethodEditor({
  value,
  onSave,
  disabled,
  inputClassName,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
  disabled?: boolean;
  inputClassName: string;
}) {
  const storedCustom = isCustomGivingMethod(value);
  const [pendingOther, setPendingOther] = useState(false);
  const showDescribe = storedCustom || pendingOther;
  const selectValue = showDescribe ? 'Other' : value ?? '';
  const describeRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState(storedCustom ? value ?? '' : '');
  useEffect(() => {
    setDraft(storedCustom ? value ?? '' : '');
    if (!storedCustom) setPendingOther(false);
  }, [value, storedCustom]);

  return (
    <div className="space-y-1.5">
      <select
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'Other') {
            setPendingOther(true);
            setDraft('');
            // Focus explicitly, only on this deliberate transition into Other -- autoFocus on
            // the input itself would re-steal focus on every remount of an already-custom
            // record (e.g. scrolling the table, or leaving and returning to the Directory),
            // silently landing keystrokes in a donor's giving method field. That's exactly
            // what corrupted a real record before this fix.
            requestAnimationFrame(() => describeRef.current?.focus());
          } else {
            setPendingOther(false);
            onSave(v || null);
          }
        }}
        disabled={disabled}
        className={inputClassName}
      >
        <option value="">—</option>
        {GIVING_METHOD_PRESETS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
        <option value="Other">Other…</option>
      </select>
      {showDescribe && (
        <input
          ref={describeRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (draft.trim() && draft !== value) onSave(draft.trim()); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') { setDraft(storedCustom ? value ?? '' : ''); e.currentTarget.blur(); }
          }}
          placeholder="Describe how they give…"
          disabled={disabled}
          className={inputClassName}
        />
      )}
    </div>
  );
}
