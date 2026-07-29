// Shared presets for every cadence/lead-time field in the Partnerships room (Directory,
// Collateral, Social/Newsletter settings) — familiar words instead of a raw day count nobody
// can eyeball (is 182 days six months or nine?).
export interface CadencePreset {
  label: string;
  days: number;
}

// "How often to check in" — recurrence language.
export const CADENCE_PRESETS: CadencePreset[] = [
  { label: 'Weekly', days: 7 },
  { label: 'Biweekly', days: 14 },
  { label: 'Monthly', days: 30 },
  { label: 'Quarterly', days: 90 },
  { label: '6 months', days: 182 },
  { label: 'Annual', days: 365 },
];

// "How far ahead to warn" — a lead/warning window isn't a recurring rhythm, so it gets its
// own plain-English wording instead of reusing "Weekly/Monthly" from CADENCE_PRESETS.
export const LEAD_TIME_PRESETS: CadencePreset[] = [
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
];

export const CUSTOM_CADENCE_LABEL = 'Custom…';

/** Returns the matching preset label for an exact day count, or the custom-entry label. */
export function presetLabelForDays(days: number | null, presets: CadencePreset[] = CADENCE_PRESETS): string {
  const match = presets.find((p) => p.days === days);
  return match ? match.label : CUSTOM_CADENCE_LABEL;
}
