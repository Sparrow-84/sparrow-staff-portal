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
  const [invalidKey, setInvalidKey] = useState<string | null>(null);
  const missing = checks.filter((c) => !c.valid);

  function validate(): boolean {
    if (missing.length > 0) {
      setInvalidKey(missing[0].key);
      const el = document.getElementById(missing[0].key);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.focus();
      return false;
    }
    setInvalidKey(null);
    return true;
  }

  function fieldClass(key: string, base = 'field-input'): string {
    return invalidKey === key ? `${base} field-input-error` : base;
  }

  function clear(key: string) {
    setInvalidKey((k) => (k === key ? null : k));
  }

  return {
    isValid: missing.length === 0,
    missingMessage: missing.length > 0 ? `Missing: ${missing.map((m) => m.label).join(', ')}` : null,
    validate,
    fieldClass,
    clear,
    reset: () => setInvalidKey(null),
  };
}
