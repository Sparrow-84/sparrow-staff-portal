import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createCalendarLabel,
  deleteCalendarLabel,
  fetchCalendarLabels,
  updateCalendarLabel,
  type CalendarLabel,
  type LabelScope,
} from '@/lib/calendar';
import { LABEL_COLORS } from '@/components/LabelPill';
import { departmentLabel, type Department } from '@/lib/types';
import { useRequiredFields } from '@/hooks/useRequiredFields';

function normalizeLabelName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Tight on purpose — catches typos/plurals ("Birthday" vs "Birthdays"), not synonyms
// ("Team Meeting" vs "Staff Meeting"). A looser threshold starts flagging genuinely
// different labels (e.g. Partnerships' "External Meeting" vs "External Booth Event"),
// which trains people to ignore the suggestion.
function isSimilarLabelName(a: string, b: string): boolean {
  if (a === b) return false;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return false;
  return dist <= 2 && dist / maxLen <= 0.3;
}

interface Props {
  value: string | null;              // selected label_id
  isPersonal: boolean;
  department: Department | null;     // null = posting to All Staff
  currentUserId: string;
  isAdmin: boolean;
  onChange: (labelId: string | null, label: CalendarLabel | null) => void;
}

type View = 'list' | 'create' | 'manage';

function labelPillClass(color: string): string {
  return LABEL_COLORS.find((c) => c.id === color)?.pill ?? 'bg-slate-100 dark:bg-slate-500/15 text-slate-600 dark:text-slate-300';
}

function labelSwatchClass(color: string): string {
  return LABEL_COLORS.find((c) => c.id === color)?.swatch ?? 'bg-slate-300';
}

export function CalendarLabelPicker({ value, isPersonal, department, currentUserId, isAdmin, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('list');
  const [allLabels, setAllLabels] = useState<CalendarLabel[]>([]);

  // Create state
  const [createName, setCreateName] = useState('');
  const [createColor, setCreateColor] = useState('blue');
  const [creating, setCreating] = useState(false);

  // Manage / edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('blue');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);

  const {
    validate: validateCreate,
    fieldClass: createFieldClass,
    fieldError: createFieldError,
    clear: clearCreate,
    reset: resetCreateValidation,
  } = useRequiredFields([
    { key: 'label-create-name', label: 'Label name', valid: createName.trim().length > 0 },
  ]);

  const {
    validate: validateEdit,
    fieldClass: editFieldClass,
    fieldError: editFieldError,
    clear: clearEdit,
    reset: resetEditValidation,
  } = useRequiredFields([
    { key: 'label-edit-name', label: 'Label name', valid: editName.trim().length > 0 },
  ]);

  function loadLabels() {
    void fetchCalendarLabels().then(setAllLabels);
  }

  useEffect(() => { loadLabels(); }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setView('list');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // "Your" labels for this posting context — same rules as before.
  const myLabels = useMemo(() => {
    return allLabels.filter((l) => {
      if (l.scope === 'preset') return true;
      if (isPersonal) return l.scope === 'personal' && l.created_by === currentUserId;
      if (department === null) return l.scope === 'all_staff';
      return l.scope === 'dept' && l.department === department;
    });
  }, [allLabels, isPersonal, department, currentUserId]);

  // Other departments' labels — visible (and pickable) so reusing an existing label is
  // the obvious move instead of recreating a near-duplicate under a different color.
  // Only applies to dept-posting context; personal/all-staff labels stay scoped as before.
  const otherLabels = useMemo(() => {
    if (isPersonal || department === null) return [];
    return allLabels.filter((l) => l.scope === 'dept' && l.department !== department);
  }, [allLabels, isPersonal, department]);

  const otherLabelsByDept = useMemo(() => {
    const map = new Map<Department, CalendarLabel[]>();
    for (const l of otherLabels) {
      if (!l.department) continue;
      if (!map.has(l.department)) map.set(l.department, []);
      map.get(l.department)!.push(l);
    }
    return map;
  }, [otherLabels]);

  // Flat pool for matching (create/rename suggestions) and lookups — everything pickable
  // in this context, own-dept first.
  const labels = useMemo(() => [...myLabels, ...otherLabels], [myLabels, otherLabels]);

  // Labels the current user can manage (edit/delete) in this context — unchanged:
  // reuse/visibility widened above, but editing rights stay with the owning dept/admins.
  const manageableLabels = useMemo(() => {
    return myLabels.filter((l) => {
      if (l.is_preset) return false;
      if (l.scope === 'all_staff') return isAdmin;
      return l.created_by === currentUserId || l.scope === 'dept';
    });
  }, [myLabels, isAdmin, currentUserId]);

  // Passive safety net for "Manage labels" — flags a label whose name collides with a
  // differently-colored one elsewhere org-wide. Purely informational; nothing pops up
  // unless someone happens to open Manage for that label. Personal-scope labels are
  // excluded since they're private per person and never need to agree with anyone else's.
  const nameConflicts = useMemo(() => {
    const map = new Map<string, CalendarLabel>();
    const shared = allLabels.filter((l) => l.scope !== 'personal');
    for (const l of shared) {
      const norm = normalizeLabelName(l.name);
      const other = shared.find((o) => o.id !== l.id && normalizeLabelName(o.name) === norm && o.color !== l.color);
      if (other) map.set(l.id, other);
    }
    return map;
  }, [allLabels]);

  const selectedLabel = allLabels.find((l) => l.id === value) ?? null;

  // Scope for newly created labels
  const newLabelScope = (): LabelScope => {
    if (isPersonal) return 'personal';
    if (department === null) return 'all_staff';
    return 'dept';
  };

  // Exact/near-duplicate detection while creating a new label — nudges toward reuse
  // instead of silently blocking a color choice. Excludes nothing by scope: `labels`
  // is already the right pool (own dept + other depts + presets, or personal-only).
  const createNameNorm = normalizeLabelName(createName);
  const createExactMatch = createNameNorm ? labels.find((l) => normalizeLabelName(l.name) === createNameNorm) ?? null : null;
  const createSimilarMatches = createNameNorm && !createExactMatch
    ? labels.filter((l) => isSimilarLabelName(normalizeLabelName(l.name), createNameNorm))
    : [];

  // Default the color swatch to the exact match's color (still overridable) so the path
  // of least resistance is "stay consistent," not "pick blind."
  useEffect(() => {
    if (createExactMatch) setCreateColor(createExactMatch.color);
  }, [createExactMatch?.id]);

  // Same check for renaming an existing label — otherwise a rename could sidestep the
  // create-time guardrail entirely.
  const editNameNorm = normalizeLabelName(editName);
  const editExactMatch = editingId && editNameNorm
    ? labels.find((l) => l.id !== editingId && normalizeLabelName(l.name) === editNameNorm) ?? null
    : null;
  const editSimilarMatches = editingId && editNameNorm && !editExactMatch
    ? labels.filter((l) => l.id !== editingId && isSimilarLabelName(normalizeLabelName(l.name), editNameNorm))
    : [];

  useEffect(() => {
    if (editExactMatch) setEditColor(editExactMatch.color);
  }, [editExactMatch?.id]);

  function open_dropdown() {
    setOpen(true);
    setView('list');
    setCreateName('');
    setCreateColor('blue');
    setEditingId(null);
    resetCreateValidation();
    resetEditValidation();
  }

  function select(label: CalendarLabel) {
    onChange(label.id, label);
    setOpen(false);
    setView('list');
  }

  function clearSelection() {
    onChange(null, null);
    setOpen(false);
    setView('list');
  }

  async function handleCreate() {
    if (!validateCreate() || creating) return;
    setCreating(true);
    try {
      const label = await createCalendarLabel({
        name: createName.trim(),
        color: createColor,
        scope: newLabelScope(),
        department: isPersonal || department === null ? null : department,
        created_by: currentUserId,
      });
      loadLabels();
      onChange(label.id, label);
      setOpen(false);
      setView('list');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(label: CalendarLabel) {
    setEditingId(label.id);
    setEditName(label.name);
    setEditColor(label.color);
    resetEditValidation();
  }

  async function handleSaveEdit(id: string) {
    if (!validateEdit() || savingEdit) return;
    setSavingEdit(true);
    try {
      await updateCalendarLabel(id, { name: editName.trim(), color: editColor });
      loadLabels();
      // If this was the selected label, update the parent with the new name/color
      if (id === value) {
        const updated = { ...allLabels.find((l) => l.id === id)!, name: editName.trim(), color: editColor };
        onChange(id, updated);
      }
      setEditingId(null);
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await deleteCalendarLabel(id);
      if (id === value) onChange(null, null);
      loadLabels();
      setEditingId(null);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <label className="field-label">Label</label>
      <button
        type="button"
        onClick={open_dropdown}
        className="field-input flex items-center justify-between text-left"
      >
        {selectedLabel ? (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${labelPillClass(selectedLabel.color)}`}>
            {selectedLabel.name}
          </span>
        ) : (
          <span className="text-sparrow-gray dark:text-sparrow-dark-gray">Pick a label…</span>
        )}
        <svg className="ml-2 h-4 w-4 shrink-0 text-sparrow-gray dark:text-sparrow-dark-gray" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface shadow-xl">

          {/* ── List view ─────────────────────────────────── */}
          {view === 'list' && (
            <>
              <ul className="py-1">
                {myLabels.map((label) => (
                  <li key={label.id}>
                    <button
                      type="button"
                      onClick={() => select(label)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2"
                    >
                      <span className={`h-3 w-3 shrink-0 rounded-full ${labelSwatchClass(label.color)}`} />
                      <span className="flex-1 truncate text-sparrow-ink dark:text-sparrow-dark-ink">{label.name}</span>
                      {label.id === value && (
                        <span className="text-sparrow-green dark:text-sparrow-dark-green">✓</span>
                      )}
                    </button>
                  </li>
                ))}
                {myLabels.length === 0 && otherLabels.length === 0 && (
                  <li className="px-3 py-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">No labels yet — create one below.</li>
                )}
              </ul>

              {/* Other departments' labels — visible so reusing one is the easy move */}
              {otherLabelsByDept.size > 0 && (
                <div className="border-t border-sparrow-rule dark:border-sparrow-dark-border py-1">
                  <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">
                    Other departments
                  </p>
                  {[...otherLabelsByDept.entries()].map(([dept, deptLabels]) => (
                    <div key={dept}>
                      <p className="px-3 pt-1 text-[11px] text-sparrow-gray dark:text-sparrow-dark-gray">{departmentLabel(dept)}</p>
                      <ul>
                        {deptLabels.map((label) => (
                          <li key={label.id}>
                            <button
                              type="button"
                              onClick={() => select(label)}
                              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2"
                            >
                              <span className={`h-3 w-3 shrink-0 rounded-full ${labelSwatchClass(label.color)}`} />
                              <span className="flex-1 truncate text-sparrow-ink dark:text-sparrow-dark-ink">{label.name}</span>
                              {label.id === value && (
                                <span className="text-sparrow-green dark:text-sparrow-dark-green">✓</span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-sparrow-rule dark:border-sparrow-dark-border">
                {value && (
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2"
                  >
                    <span>✕</span> Clear label
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setView('create')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2"
                >
                  <span>+</span> Create label
                </button>
                {manageableLabels.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setView('manage'); setEditingId(null); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2"
                  >
                    <span>✎</span> Manage labels
                  </button>
                )}
              </div>
            </>
          )}

          {/* ── Create view ───────────────────────────────── */}
          {view === 'create' && (
            <div className="p-3 space-y-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setView('list')}
                  className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
                >
                  ← Back
                </button>
                <span className="text-xs font-semibold text-sparrow-ink dark:text-sparrow-dark-ink field-label-required">New label</span>
              </div>
              <input
                id="label-create-name"
                type="text"
                value={createName}
                onChange={(e) => { setCreateName(e.target.value); clearCreate('label-create-name'); }}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); }}
                placeholder="Label name…"
                className={createFieldClass('label-create-name')}
                autoFocus
              />
              {createFieldError('label-create-name') && <p className="mt-1 text-xs text-priority-p1">{createFieldError('label-create-name')}</p>}

              {createExactMatch && (
                <button
                  type="button"
                  onClick={() => select(createExactMatch)}
                  className="flex w-full items-center gap-2 rounded-lg bg-sparrow-mist dark:bg-sparrow-dark-surface2 px-2.5 py-1.5 text-left text-xs text-sparrow-ink dark:text-sparrow-dark-ink hover:opacity-80"
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${labelSwatchClass(createExactMatch.color)}`} />
                  <span className="flex-1">"{createExactMatch.name}" already exists — use it?</span>
                </button>
              )}
              {!createExactMatch && createSimilarMatches.length > 0 && (
                <div className="space-y-1">
                  {createSimilarMatches.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => select(m)}
                      className="flex w-full items-center gap-2 rounded-lg bg-sparrow-mist dark:bg-sparrow-dark-surface2 px-2.5 py-1.5 text-left text-xs text-sparrow-ink dark:text-sparrow-dark-ink hover:opacity-80"
                    >
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${labelSwatchClass(m.color)}`} />
                      <span className="flex-1">Similar to "{m.name}" — use it?</span>
                    </button>
                  ))}
                </div>
              )}

              <div>
                <p className="mb-1.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                  Color
                  {createExactMatch && <span className="ml-1 font-normal">— matched to "{createExactMatch.name}" to keep it consistent</span>}
                </p>
                <div className="flex flex-wrap gap-2">
                  {LABEL_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCreateColor(c.id)}
                      className={`h-5 w-5 rounded-full ${c.swatch} transition ${createColor === c.id ? 'ring-2 ring-offset-1 ring-sparrow-ink dark:ring-sparrow-dark-ink dark:ring-offset-sparrow-dark-surface' : 'opacity-70 hover:opacity-100'}`}
                      aria-label={c.id}
                    />
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={creating}
                className="btn-primary w-full text-sm"
              >
                {creating ? 'Saving…' : 'Save label'}
              </button>
            </div>
          )}

          {/* ── Manage view ───────────────────────────────── */}
          {view === 'manage' && (
            <div className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setView('list'); setEditingId(null); resetEditValidation(); }}
                  className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
                >
                  ← Back
                </button>
                <span className="text-xs font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">Manage labels</span>
              </div>
              {manageableLabels.length === 0 && (
                <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">No labels to manage yet.</p>
              )}
              {manageableLabels.map((label) => (
                <div key={label.id} className="rounded-lg bg-sparrow-mist/50 dark:bg-sparrow-dark-surface2/50 p-2">
                  {editingId === label.id ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {LABEL_COLORS.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setEditColor(c.id)}
                            className={`h-4 w-4 rounded-full ${c.swatch} transition ${editColor === c.id ? 'ring-2 ring-offset-1 ring-sparrow-ink dark:ring-sparrow-dark-ink dark:ring-offset-sparrow-dark-surface' : 'opacity-70 hover:opacity-100'}`}
                            aria-label={c.id}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          id="label-edit-name"
                          type="text"
                          value={editName}
                          onChange={(e) => { setEditName(e.target.value); clearEdit('label-edit-name'); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveEdit(label.id); if (e.key === 'Escape') { setEditingId(null); resetEditValidation(); } }}
                          className={editFieldClass('label-edit-name', 'field-input flex-1 py-1 text-xs')}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => void handleSaveEdit(label.id)}
                          disabled={savingEdit}
                          className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:opacity-70"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingId(null); resetEditValidation(); }}
                          className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
                        >
                          ✕
                        </button>
                      </div>
                      {editFieldError('label-edit-name') && <p className="mt-1 text-xs text-priority-p1">{editFieldError('label-edit-name')}</p>}
                      {editExactMatch && (
                        <p className="flex items-center gap-2 rounded-lg bg-white dark:bg-sparrow-dark-surface px-2 py-1 text-[11px] text-sparrow-gray dark:text-sparrow-dark-gray">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${labelSwatchClass(editExactMatch.color)}`} />
                          <span className="flex-1">"{editExactMatch.name}" already exists — color updated to match.</span>
                        </p>
                      )}
                      {!editExactMatch && editSimilarMatches.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => { setEditName(m.name); setEditColor(m.color); }}
                          className="flex w-full items-center gap-2 rounded-lg bg-white dark:bg-sparrow-dark-surface px-2 py-1 text-left text-[11px] text-sparrow-ink dark:text-sparrow-dark-ink hover:opacity-80"
                        >
                          <span className={`h-2 w-2 shrink-0 rounded-full ${labelSwatchClass(m.color)}`} />
                          <span className="flex-1">Similar to "{m.name}" — match it?</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={`h-3 w-3 shrink-0 rounded-full ${labelSwatchClass(label.color)}`} />
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-sparrow-ink dark:text-sparrow-dark-ink">{label.name}</span>
                        {nameConflicts.has(label.id) && (
                          <span className="flex items-center gap-1 text-[10px] text-sparrow-gray dark:text-sparrow-dark-gray">
                            Also used elsewhere in
                            <span className={`inline-block h-2 w-2 rounded-full ${labelSwatchClass(nameConflicts.get(label.id)!.color)}`} />
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => startEdit(label)}
                        className="text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
                        aria-label="Edit"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(label.id)}
                        disabled={deletingId === label.id}
                        className="text-sparrow-gray dark:text-sparrow-dark-gray hover:text-priority-p1"
                        aria-label="Delete"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={() => setView('create')}
                className="flex w-full items-center gap-2 pt-1 text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:opacity-70"
              >
                <span>+</span> Create new label
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
