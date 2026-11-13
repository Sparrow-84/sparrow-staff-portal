import { useCallback, useState } from 'react';
import {
  NUMBER_GROUPS,
  createNumber,
  deleteNumber,
  groupNumbers,
  longDate,
  markNumbersChecked,
  numbersCheckTone,
  todayISO,
  twoYearsFrom,
  updateNumber,
  type NumbersCheck,
  type NumberGroup,
  type NumberInput,
  type ResidentNumber,
} from '@/lib/resident-numbers';
import { PrintNumbers } from './PrintList';

/** Resident Services → "Essential Phone Numbers": a plain phone list, not linked to the Directory. */
export function ImportantNumbersTab({
  numbers,
  missing,
  check,
  currentUserId,
  nameFor,
  onChanged,
}: {
  numbers: ResidentNumber[];
  missing: boolean;
  /** The whole-list check (migration 0226); null until it runs. */
  check: NumbersCheck | null;
  currentUserId: string;
  nameFor: (id: string | null) => string | null;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const endPrint = useCallback(() => setPrinting(false), []);

  if (missing) {
    return (
      <p className="mt-6 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
        This tab is waiting on a database update (migration 0220). It will start working as soon as that runs.
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      {check && <CheckBar check={check} currentUserId={currentUserId} nameFor={nameFor} onChanged={onChanged} />}
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto max-w-xl text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
          Numbers anyone can call. There's nothing to qualify for, and the list is the same for every resident. Not linked to the Partnerships Directory.
        </p>
        <button onClick={() => setPrinting(true)} disabled={numbers.length === 0} className="btn-secondary px-3 py-1.5 text-sm">
          Print
        </button>
        <button onClick={() => { setAdding(true); setEditingId(null); }} className="btn-primary">
          + Add a number
        </button>
      </div>

      {adding && (
        <NumberForm
          onCancel={() => setAdding(false)}
          onSave={async (input) => { await createNumber(input); setAdding(false); onChanged(); }}
        />
      )}

      {numbers.length === 0 && !adding && (
        <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No numbers yet. Click "+ Add a number" to add the first one.</p>
      )}

      {groupNumbers(numbers).map((g) => (
        <section key={g.key}>
          <h2 className="mb-1.5 text-sm font-semibold text-sparrow-green dark:text-sparrow-dark-green">{g.label}</h2>
          <div className="overflow-hidden rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface">
            {g.rows.map((n) =>
              editingId === n.id ? (
                <div key={n.id} className="border-t border-sparrow-rule dark:border-sparrow-dark-border p-3 first:border-t-0">
                  <NumberForm
                    initial={n}
                    onCancel={() => setEditingId(null)}
                    onSave={async (input) => { await updateNumber(n.id, input); setEditingId(null); onChanged(); }}
                    onRemove={async () => { await deleteNumber(n.id); setEditingId(null); onChanged(); }}
                  />
                </div>
              ) : (
                <div key={n.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 border-t border-sparrow-rule dark:border-sparrow-dark-border px-4 py-2.5 text-sm first:border-t-0">
                  <div className="min-w-0">
                    <span className="font-medium">{n.name}</span>
                    {n.on_services_list && (
                      <span className="ml-2 rounded-full bg-sparrow-green/10 px-2 py-0.5 text-[11px] font-semibold text-sparrow-green dark:text-sparrow-dark-green">
                        Also on every Assistance Programs printout
                      </span>
                    )}
                    {n.note && <span className="block text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{n.note}</span>}
                  </div>
                  <span className="select-text whitespace-nowrap font-semibold tabular-nums">{n.phone}</span>
                  <button
                    onClick={() => { setEditingId(n.id); setAdding(false); }}
                    className="text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-green hover:underline"
                  >
                    Edit
                  </button>
                </div>
              ),
            )}
          </div>
        </section>
      ))}

      {printing && <PrintNumbers numbers={numbers} lastChecked={check?.last_checked_on ?? null} onDone={endPrint} />}
    </div>
  );
}

const BAR_TONE = {
  fresh: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
  due: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
  overdue: 'border-red-300 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200',
  never: 'border-sparrow-rule bg-sparrow-mist text-sparrow-ink dark:border-sparrow-dark-border dark:bg-sparrow-dark-surface2 dark:text-sparrow-dark-ink',
} as const;

/** The whole list is checked together every 2 years. Same colors as the Assistance Programs
 *  stamps: green, amber from two weeks before the Next check (a task arrives), red once it's
 *  overdue (a higher-priority task). */
function CheckBar({
  check,
  currentUserId,
  nameFor,
  onChanged,
}: {
  check: NumbersCheck;
  currentUserId: string;
  nameFor: (id: string | null) => string | null;
  onChanged: () => void;
}) {
  const tone = numbersCheckTone(check);
  // "✓ All checked" asks for the next check date. It's the only way to set that date (any time,
  // early is fine), and it can't be more than 2 years out -- so the check can't just be pushed
  // back again and again (decided 2026-11-13; the database enforces it too).
  const [asking, setAsking] = useState(false);
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const maxDate = twoYearsFrom(todayISO());

  const open = () => {
    setAsking(true);
    setError(null);
    setDate(maxDate);
  };

  const save = async () => {
    if (!date) { setError('Pick a date.'); return; }
    if (date <= todayISO()) { setError('Pick a date after today.'); return; }
    if (date > maxDate) { setError('The next check can be 2 years away at most.'); return; }
    setBusy(true); setError(null);
    try {
      await markNumbersChecked(currentUserId, date);
      setAsking(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const who = nameFor(check.last_checked_by);
  const last = check.last_checked_on ? `All numbers last checked ${longDate(check.last_checked_on)}${who ? ` by ${who}` : ''}` : null;
  const next = check.next_check_on ? longDate(check.next_check_on) : null;

  let message: string;
  if (tone === 'never') message = "The full list hasn't been checked yet. Once you've called or looked up every number, click ✓ All checked.";
  else if (tone === 'due') message = `Time to check every number. Due ${next}. Call or look up each one, fix any that changed, then click ✓ All checked.`;
  else if (tone === 'overdue') message = `Overdue: every number should have been checked by ${next}. Call or look up each one, fix any that changed, then click ✓ All checked.`;
  else message = `${last} · Next check ${next}`;

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${BAR_TONE[tone]}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="mr-auto flex min-w-0 items-start gap-2">
          {tone !== 'never' && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-current" aria-hidden />}
          <span>
            {message}
            {tone !== 'fresh' && last && <span className="block text-xs opacity-80">{last}</span>}
          </span>
        </span>
        {!asking && (
          <button type="button" onClick={open} className="btn-primary px-3 py-1.5 text-sm">
            ✓ All checked
          </button>
        )}
      </div>
      {asking && (
        <form
          onSubmit={(e) => { e.preventDefault(); void save(); }}
          className="mt-3 flex flex-wrap items-end gap-2 border-t border-current/15 pt-3"
        >
          <label className="block">
            <span className="field-label">When should the next check be? (2 years at most)</span>
            <input type="date" value={date} min={todayISO()} max={maxDate} onChange={(e) => setDate(e.target.value)} className="field-input" />
          </label>
          <button type="button" onClick={() => setAsking(false)} className="btn-secondary px-3 py-1.5 text-sm">Cancel</button>
          <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save'}</button>
          {error && <p className="w-full text-xs text-priority-p1">{error}</p>}
        </form>
      )}
    </div>
  );
}

function NumberForm({
  initial,
  onSave,
  onCancel,
  onRemove,
}: {
  initial?: ResidentNumber;
  onSave: (input: NumberInput) => Promise<void>;
  onCancel: () => void;
  onRemove?: () => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  // No default group: whoever adds it picks one.
  const [group, setGroup] = useState<NumberGroup | ''>(initial?.group_key ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [pin, setPin] = useState(initial?.on_services_list ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const missingName = !name.trim();
  const missingPhone = !phone.trim();
  const missingGroup = !group;

  const save = async () => {
    setTried(true);
    if (missingName || missingPhone || missingGroup) return;
    setBusy(true); setError(null);
    try {
      await onSave({ name: name.trim(), phone: phone.trim(), group_key: group as NumberGroup, note: note.trim() || null, on_services_list: pin });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!onRemove) return;
    setBusy(true); setError(null);
    try { await onRemove(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not remove.'); setBusy(false); }
  };

  const err = (bad: boolean) => (tried && bad ? ' field-input-error' : '');

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void save(); }}
      className="grid gap-3 rounded-xl border border-sparrow-gold bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="field-label field-label-required">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={`field-input${err(missingName)}`} placeholder="e.g. Corvallis Police" />
        </label>
        <label className="block">
          <span className="field-label field-label-required">Phone</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={`field-input${err(missingPhone)}`} placeholder="e.g. 541-766-6924" />
        </label>
        <label className="block">
          <span className="field-label field-label-required">Group</span>
          <select value={group} onChange={(e) => setGroup(e.target.value as NumberGroup)} className={`field-input${err(missingGroup)}`}>
            <option value="" disabled>Pick a group…</option>
            {NUMBER_GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Short note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className="field-input" placeholder="e.g. Non-emergency · Fax 541-766-6011" />
        </label>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} className="mt-0.5 h-4 w-4 accent-sparrow-green" />
        <span>
          Also put it at the bottom of every Assistance Programs printout
          <span className="block text-xs text-sparrow-gray dark:text-sparrow-dark-gray">For numbers everyone should keep, like 911 and 988.</span>
        </span>
      </label>
      {tried && (missingName || missingPhone || missingGroup) && (
        <p className="text-xs text-priority-p1">Name, phone and group are required.</p>
      )}
      {error && <p className="text-xs text-priority-p1">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {onRemove && !confirmRemove && (
          <button type="button" onClick={() => setConfirmRemove(true)} className="mr-auto text-xs font-medium text-priority-p1 hover:underline">
            Remove this number
          </button>
        )}
        {onRemove && confirmRemove && (
          <span className="mr-auto flex flex-wrap items-center gap-2 text-xs">
            Remove {initial?.name}?
            <button type="button" onClick={() => setConfirmRemove(false)} className="btn-secondary px-2 py-1 text-xs">Keep it</button>
            <button type="button" onClick={() => void remove()} disabled={busy} className="rounded-lg bg-priority-p1 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">Remove it</button>
          </span>
        )}
        <span className={onRemove ? '' : 'ml-auto'} />
        <button type="button" onClick={onCancel} className="btn-secondary px-3 py-1.5 text-sm">Cancel</button>
        <button type="submit" disabled={busy} className="btn-primary">{initial ? 'Save' : 'Add number'}</button>
      </div>
    </form>
  );
}
