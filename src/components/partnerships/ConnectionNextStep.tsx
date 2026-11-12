// "Done" / "Choose next step" for a Meaningful Connection. Every connection always has a next
// step: another follow-up, a new Directory record, a contact on an existing Directory record,
// or the archive (nothing more to do; kept as a record of what happened). Used on the
// Events tab, the connection's side panel and
// Partnerships Home, so the button and its question are identical everywhere.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/auth/AuthContext';
import { DirectoryRecordPicker } from './DirectoryRecordPicker';
import {
  addConnectionToExistingRecord,
  archiveConnection,
  connectionNeedsNextStep,
  setNextFollowup,
  type PartnershipConnection,
} from '@/lib/partnerships-tabs';

type Choice = 'followup' | 'existing' | 'directory' | 'archive';

export function ConnectionNextStep({
  connection,
  onAddToDirectory,
  onDone,
  variant = 'link',
}: {
  connection: PartnershipConnection;
  /** Opens the Add to Directory form prefilled from this connection. */
  onAddToDirectory: (conn: PartnershipConnection) => void;
  onDone: () => void;
  /** 'link' = small text link (table cell, side panel); 'button' = green pill (Home). */
  variant?: 'link' | 'button';
}) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [due, setDue] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [recordId, setRecordId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const needsNextStep = connectionNeedsNextStep(connection);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onScroll(e: Event) {
      if (popoverRef.current && e.target instanceof Node && popoverRef.current.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 328)) });
    setChoice(null);
    setDue('');
    setNextAction('');
    setRecordId(null);
    setError(null);
    setOpen(true);
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setOpen(false);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (choice === 'followup') {
      if (!due) return;
      void run(() => setNextFollowup(connection, due, nextAction.trim() || null));
    } else if (choice === 'archive') {
      if (!profile) return;
      void run(() => archiveConnection(connection.id, profile.id));
    } else if (choice === 'existing') {
      if (!profile || !recordId) return;
      void run(() => addConnectionToExistingRecord(connection, recordId, profile.id));
    } else if (choice === 'directory') {
      setOpen(false);
      onAddToDirectory(connection);
    }
  }

  const options: { value: Choice; label: string; hint: string }[] = [
    { value: 'followup', label: 'Set a follow-up', hint: 'There is something more to do with them.' },
    { value: 'existing', label: 'Add to an existing Directory record', hint: 'Their organization is already in the Directory. They join its contacts.' },
    { value: 'directory', label: 'Add to Directory as a new record', hint: 'An ongoing relationship. Opens the Add form with their details.' },
    { value: 'archive', label: 'Archive', hint: 'Nothing more to do. Kept as a record of what happened.' },
  ];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className={
          variant === 'button'
            ? 'mt-1 shrink-0 rounded-lg bg-sparrow-green dark:bg-sparrow-dark-green px-2.5 py-1 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50'
            : `text-left text-xs font-medium hover:underline ${needsNextStep ? 'text-priority-p1' : 'text-sparrow-green dark:text-sparrow-dark-green'}`
        }
      >
        {needsNextStep ? 'Choose next step' : 'Done'}
      </button>
      {open && pos && createPortal(
        <div
          ref={popoverRef}
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 320 }}
          className="z-50 space-y-2 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-3 shadow-lg"
        >
          <p className="text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">
            {needsNextStep ? `What's next with ${connection.name}?` : `Followed up with ${connection.name}. What's next?`}
          </p>
          <div className="space-y-1">
            {options.map((o) => (
              <label
                key={o.value}
                className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 ${choice === o.value ? 'bg-sparrow-mist dark:bg-sparrow-dark-surface2' : 'hover:bg-sparrow-mist/50 dark:hover:bg-sparrow-dark-surface2'}`}
              >
                <input
                  type="radio"
                  name={`next-step-${connection.id}`}
                  checked={choice === o.value}
                  onChange={() => setChoice(o.value)}
                  className="mt-0.5 accent-sparrow-green"
                  disabled={busy}
                />
                <span>
                  <span className="block text-sm text-sparrow-ink dark:text-sparrow-dark-ink">{o.label}</span>
                  <span className="block text-[11px] leading-snug text-sparrow-gray dark:text-sparrow-dark-gray">{o.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {choice === 'followup' && (
            <div className="space-y-2 pl-2">
              <div>
                <label className="field-label field-label-required">Follow up by</label>
                <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="field-input mt-0 w-full" disabled={busy} />
              </div>
              <div>
                <label className="field-label">Next action</label>
                <input
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                  placeholder="e.g. Send the volunteer info packet"
                  className="field-input mt-0 w-full"
                  disabled={busy}
                />
              </div>
              <p className="text-[11px] leading-snug text-sparrow-gray dark:text-sparrow-dark-gray">
                It comes up on Home and in the owner's tasks a week before this date.
              </p>
            </div>
          )}
          {choice === 'existing' && (
            <div className="space-y-1 pl-2">
              <label className="field-label field-label-required">Which record?</label>
              <DirectoryRecordPicker value={recordId} onChange={setRecordId} initialSearch={connection.organization} disabled={busy} />
              <p className="text-[11px] leading-snug text-sparrow-gray dark:text-sparrow-dark-gray">
                Their name, role, phone and email are added to the record's contacts, with where
                you met and what you discussed in the contact's notes.
              </p>
            </div>
          )}
          {error && <p className="text-xs text-priority-p1">{error}</p>}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setOpen(false)} disabled={busy} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy || !choice || (choice === 'followup' && !due) || (choice === 'existing' && !recordId)}
              className="btn-primary px-3 py-1.5 text-xs"
            >
              {busy ? 'Saving…' : choice === 'directory' ? 'Continue' : 'Save'}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
