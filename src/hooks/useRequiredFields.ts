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

  return {
    isValid: missing.length === 0,
    missingMessage: missing.length > 0 ? `Missing: ${missing.map((m) => m.label).join(', ')}` : null,
    validate,
    fieldClass,
    fieldError,
    clear,
    reset: () => setInvalidKeys(new Set()),
  };
}
