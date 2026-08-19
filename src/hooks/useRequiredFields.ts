import { useState } from 'react';

export interface FieldCheck {
  key: string;
  label: string;
  valid: boolean;
}

/**
 * Replaces a bare `canSave` boolean with named field checks so a failed save
 * can point at the specific missing field instead of just disabling the button.
 */
export function useRequiredFields(checks: FieldCheck[]) {
  const [invalidKeys, setInvalidKeys] = useState<Set<string>>(new Set());
  const missing = checks.filter((c) => !c.valid);

  function validate(): boolean {
    if (missing.length > 0) {
      // Flag every missing field at once (not just the first) so a form with
      // several blank required fields highlights all of them in one pass.
      setInvalidKeys(new Set(missing.map((m) => m.key)));
      const el = document.getElementById(missing[0].key);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.focus();
      return false;
    }
    setInvalidKeys(new Set());
    return true;
  }

  function fieldClass(key: string, base = 'field-input'): string {
    return invalidKeys.has(key) ? `${base} field-input-error` : base;
  }

  // Per-field caption ("Required") to render under a flagged field.
  function fieldError(key: string): string | null {
    return invalidKeys.has(key) ? 'Required' : null;
  }

  function clear(key: string) {
    setInvalidKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  // Only report fields that failed a real save attempt (i.e. are in
  // invalidKeys), not every field that's merely blank right now -- otherwise
  // "Missing: Amount" shows the instant the form renders, before anyone's
  // touched it, which reads as an error about a value that's already there.
  const flaggedMissing = missing.filter((m) => invalidKeys.has(m.key));

  return {
    isValid: missing.length === 0,
    missingMessage: flaggedMissing.length > 0 ? `Missing: ${flaggedMissing.map((m) => m.label).join(', ')}` : null,
    validate,
    fieldClass,
    fieldError,
    clear,
    reset: () => setInvalidKeys(new Set()),
  };
}
