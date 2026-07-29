import { useEffect, useState } from 'react';
import { CADENCE_PRESETS, CUSTOM_CADENCE_LABEL, presetLabelForDays, type CadencePreset } from '@/lib/cadence';

// Dropdown of familiar rhythms (Weekly/Monthly/Quarterly/...) backed by a plain day count in
// the database — falls back to a "Custom…" number field for anything that doesn't match one
// of the presets exactly (including values already saved before this control existed).
export function CadenceInput({
  value,
  onCommit,
  disabled,
  presets = CADENCE_PRESETS,
}: {
  value: number | null;
  onCommit: (days: number) => void;
  disabled?: boolean;
  presets?: CadencePreset[];
}) {
  const [preset, setPreset] = useState(() => presetLabelForDays(value, presets));
  const [customDays, setCustomDays] = useState<string>(value != null ? String(value) : '');

  useEffect(() => {
    setPreset(presetLabelForDays(value, presets));
    setCustomDays(value != null ? String(value) : '');
  }, [value, presets]);

  function handlePresetChange(label: string) {
    setPreset(label);
    if (label === CUSTOM_CADENCE_LABEL) return; // wait for the custom field below
    const match = presets.find((p) => p.label === label);
    if (match) onCommit(match.days);
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={preset}
        disabled={disabled}
        onChange={(e) => handlePresetChange(e.target.value)}
        className="field-input mt-0 min-w-[110px] py-1 text-xs"
      >
        {presets.map((p) => (
          <option key={p.label} value={p.label}>
            {p.label}
          </option>
        ))}
        <option value={CUSTOM_CADENCE_LABEL}>{CUSTOM_CADENCE_LABEL}</option>
      </select>
      {preset === CUSTOM_CADENCE_LABEL && (
        <input
          type="number"
          min={1}
          value={customDays}
          disabled={disabled}
          onChange={(e) => setCustomDays(e.target.value)}
          onBlur={(e) => {
            if (!e.target.value) { setCustomDays(value != null ? String(value) : ''); return; }
            const v = Math.max(1, Number(e.target.value));
            if (v !== value) onCommit(v);
          }}
          placeholder="days"
          className="field-input mt-0 w-16 py-1 text-xs"
        />
      )}
    </div>
  );
}
