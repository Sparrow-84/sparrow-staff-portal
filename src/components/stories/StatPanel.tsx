import { useEffect, useState, useTransition } from 'react';
import { Drawer } from '@/components/lcp/Drawer';
import { StatLabelPicker } from './StatLabelPicker';
import {
  createStat,
  deleteStat,
  updateStat,
  type Stat,
  type StatLabel,
} from '@/lib/stats';
import type { Profile } from '@/lib/types';
import { LABEL_COLORS } from '@/components/LabelPill';
import { useRequiredFields } from '@/hooks/useRequiredFields';

interface Props {
  open: boolean;
  stat: Stat | null; // null = add mode
  profiles: Profile[];
  statLabels: StatLabel[];
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
  onLabelsChanged: () => void;
}

export function StatPanel({ open, stat, profiles, statLabels, currentUserId, onClose, onChanged, onLabelsChanged }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit'>('edit');
  const [copied, setCopied] = useState(false);

  const [statText, setStatText] = useState('');
  const [context, setContext] = useState('');
  const [source, setSource] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceDate, setSourceDate] = useState('');
  const [verified, setVerified] = useState(false);
  const [verifiedBy, setVerifiedBy] = useState<string | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [usedIn, setUsedIn] = useState('');
  const [loggedBy, setLoggedBy] = useState('');

  // Anyone who can actually get into this room — same rule the room itself uses
  // (admins, plus whoever's been individually granted access) — so this list
  // never needs separate maintenance as staff access changes.
  const loggers = profiles.filter((p) => p.role === 'admin' || p.stories_access);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmDelete(false);
    setCopied(false);
    setMode(stat ? 'view' : 'edit');
    if (stat) {
      setStatText(stat.stat_text);
      setContext(stat.context ?? '');
      setSource(stat.source);
      setSourceUrl(stat.source_url ?? '');
      setSourceDate(stat.source_date ?? '');
      setVerified(stat.verified);
      setVerifiedBy(stat.verified_by);
      setVerifiedAt(stat.verified_at);
      setLabels(stat.labels);
      setUsedIn(stat.used_in ?? '');
      setLoggedBy(stat.logged_by ?? '');
    } else {
      setStatText('');
      setContext('');
      setSource('');
      setSourceUrl('');
      setSourceDate('');
      setVerified(false);
      setVerifiedBy(null);
      setVerifiedAt(null);
      setLabels([]);
      setUsedIn('');
      setLoggedBy(currentUserId);
    }
    resetValidation();
  }, [open, stat, currentUserId]);

  const { missingMessage, validate, fieldClass, fieldError, clear, reset: resetValidation } = useRequiredFields([
    { key: 'stp-text', label: 'Stat', valid: statText.trim().length > 0 },
    { key: 'stp-source', label: 'Source', valid: source.trim().length > 0 },
  ]);

  function toggleVerified(checked: boolean) {
    setVerified(checked);
    if (checked) {
      setVerifiedBy(currentUserId);
      setVerifiedAt(new Date().toISOString());
    } else {
      setVerifiedBy(null);
      setVerifiedAt(null);
    }
  }

  function buildPayload() {
    return {
      stat_text: statText.trim(),
      context: context.trim() || null,
      source: source.trim(),
      source_url: sourceUrl.trim() || null,
      source_date: sourceDate || null,
      verified,
      verified_by: verifiedBy,
      verified_at: verifiedAt,
      labels,
      used_in: usedIn.trim() || null,
      logged_by: loggedBy || null,
    };
  }

  function save() {
    if (!validate()) return;
    startTransition(async () => {
      try {
        if (stat) {
          await updateStat(stat.id, buildPayload());
        } else {
          await createStat({ ...buildPayload(), created_by: currentUserId });
        }
        onChanged();
        if (stat) setMode('view');
        else onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save.');
      }
    });
  }

  function handleDelete() {
    if (!stat) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      try {
        await deleteStat(stat.id);
        onChanged();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not delete.');
      }
    });
  }

  async function copyStatText() {
    await navigator.clipboard.writeText(stat?.stat_text ?? '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const loggerName = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? '—';

  if (stat && mode === 'view') {
    return (
      <Drawer
        open={open}
        onClose={onClose}
        title={stat.stat_text}
        subtitle={stat.source}
        wide
        footer={
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={handleDelete}
              disabled={pending}
              className={`text-sm font-medium transition ${
                confirmDelete ? 'text-priority-p1 underline' : 'text-sparrow-gray dark:text-sparrow-dark-gray hover:text-priority-p1'
              }`}
            >
              {confirmDelete ? 'Confirm delete' : 'Delete'}
            </button>
            <div className="flex items-center gap-2">
              <button onClick={copyStatText} className="btn-ghost">
                {copied ? 'Copied!' : 'Copy stat text'}
              </button>
              <button onClick={() => setMode('edit')} className="btn-primary">
                Edit
              </button>
            </div>
          </div>
        }
      >
        <div className="rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist/30 dark:bg-sparrow-dark-surface2 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">
            {stat.verified ? '✓ Verified' : 'Not yet verified'}
          </p>
          {stat.verified && (
            <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
              {stat.verified_by_name ?? loggerName(stat.verified_by)}
              {stat.verified_at ? ` · ${stat.verified_at.slice(0, 10)}` : ''}
            </p>
          )}
        </div>

        {context && (
          <p className="mt-4 text-sm text-sparrow-ink dark:text-sparrow-dark-ink">{context}</p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="field-label">Source</span>
            <p className="text-sparrow-ink dark:text-sparrow-dark-ink">{stat.source}</p>
          </div>
          <div>
            <span className="field-label">Source date</span>
            <p className="text-sparrow-ink dark:text-sparrow-dark-ink">{stat.source_date || '—'}</p>
          </div>
          {stat.source_url && (
            <div className="col-span-2">
              <span className="field-label">Source link</span>
              <p className="truncate">
                <a href={stat.source_url} target="_blank" rel="noopener noreferrer" className="text-sparrow-green dark:text-sparrow-dark-green hover:underline">
                  {stat.source_url}
                </a>
              </p>
            </div>
          )}
          <div>
            <span className="field-label">Logged by</span>
            <p className="text-sparrow-ink dark:text-sparrow-dark-ink">{stat.logged_by_name ?? loggerName(stat.logged_by)}</p>
          </div>
          <div>
            <span className="field-label">Used in</span>
            <p className="text-sparrow-ink dark:text-sparrow-dark-ink">{stat.used_in || '—'}</p>
          </div>
        </div>

        {stat.labels.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1">
            {stat.labels.map((label) => {
              const color = statLabels.find((l) => l.name === label)?.color;
              const pill = LABEL_COLORS.find((c) => c.id === color)?.pill ?? 'bg-sparrow-sage dark:bg-sparrow-dark-surface2 text-sparrow-green dark:text-sparrow-dark-green';
              return (
                <span key={label} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${pill}`}>
                  {label}
                </span>
              );
            })}
          </div>
        )}

        {error && <p className="mt-4 text-sm text-priority-p1">{error}</p>}
      </Drawer>
    );
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={stat ? 'Edit stat' : 'Add stat'}
      subtitle={stat ? stat.source : undefined}
      wide
      footer={
        <div className="flex items-center justify-between gap-2">
          {stat ? (
            <button
              onClick={handleDelete}
              disabled={pending}
              className={`text-sm font-medium transition ${
                confirmDelete ? 'text-priority-p1 underline' : 'text-sparrow-gray dark:text-sparrow-dark-gray hover:text-priority-p1'
              }`}
            >
              {confirmDelete ? 'Confirm delete' : 'Delete'}
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => (stat ? setMode('view') : onClose())} className="btn-ghost">
              Cancel
            </button>
            <button onClick={save} disabled={pending} className="btn-primary">
              {pending ? 'Saving…' : stat ? 'Save' : 'Add stat'}
            </button>
          </div>
        </div>
      }
    >
      {/* Stat text */}
      <label className="field-label field-label-required" htmlFor="stp-text">
        Stat <span className="font-normal text-sparrow-gray dark:text-sparrow-dark-gray">(exact wording — copy it verbatim from the source)</span>
      </label>
      <textarea
        id="stp-text"
        className={fieldClass('stp-text')}
        rows={2}
        value={statText}
        onChange={(e) => { setStatText(e.target.value); clear('stp-text'); }}
        placeholder="e.g. 43% of unhoused individuals in Benton County report a disabling condition"
      />
      {fieldError('stp-text') && <p className="mt-1 text-xs text-priority-p1">{fieldError('stp-text')}</p>}

      {/* Context */}
      <div className="mt-4">
        <label className="field-label" htmlFor="stp-context">
          Context <span className="font-normal text-sparrow-gray dark:text-sparrow-dark-gray">(optional — what it's about, at a glance)</span>
        </label>
        <textarea
          id="stp-context"
          className="field-input"
          rows={2}
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="e.g. From the annual county homelessness count — useful for grant narratives about disability access."
        />
      </div>

      {/* Source */}
      <div className="mt-4">
        <label className="field-label field-label-required" htmlFor="stp-source">
          Source
        </label>
        <input
          id="stp-source"
          className={fieldClass('stp-source')}
          value={source}
          onChange={(e) => { setSource(e.target.value); clear('stp-source'); }}
          placeholder="e.g. 2024 Benton County Point-in-Time Count"
        />
        {fieldError('stp-source') && <p className="mt-1 text-xs text-priority-p1">{fieldError('stp-source')}</p>}
      </div>

      {/* Source URL + date */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="field-label" htmlFor="stp-source-url">
            Source link <span className="font-normal text-sparrow-gray dark:text-sparrow-dark-gray">(optional)</span>
          </label>
          <input
            id="stp-source-url"
            type="url"
            className="field-input"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="stp-source-date">
            Source date <span className="font-normal text-sparrow-gray dark:text-sparrow-dark-gray">(optional)</span>
          </label>
          <input
            id="stp-source-date"
            type="date"
            className="field-input"
            value={sourceDate}
            onChange={(e) => setSourceDate(e.target.value)}
          />
        </div>
      </div>

      {/* Logged by */}
      <div className="mt-4">
        <label className="field-label" htmlFor="stp-logged-by">
          Logged by
        </label>
        <select
          id="stp-logged-by"
          className="field-input"
          value={loggedBy}
          onChange={(e) => setLoggedBy(e.target.value)}
        >
          <option value="">— unassigned —</option>
          {loggers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
      </div>

      {/* Labels */}
      <div className="mt-4">
        <StatLabelPicker
          value={labels}
          allLabels={statLabels}
          currentUserId={currentUserId}
          onChange={setLabels}
          onLabelsChanged={onLabelsChanged}
        />
      </div>

      {/* Used in */}
      <div className="mt-4">
        <label className="field-label" htmlFor="stp-used-in">
          Used in <span className="font-normal text-sparrow-gray dark:text-sparrow-dark-gray">(optional)</span>
        </label>
        <input
          id="stp-used-in"
          className="field-input"
          value={usedIn}
          onChange={(e) => setUsedIn(e.target.value)}
          placeholder="e.g. Fall 2026 grant narrative"
        />
      </div>

      {/* Verified */}
      <div className="mt-5 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist/30 dark:bg-sparrow-dark-surface2 px-4 py-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={verified}
            onChange={(e) => toggleVerified(e.target.checked)}
            className="h-4 w-4 accent-sparrow-green"
          />
          Verified — wording and source double-checked, safe to cite
        </label>
        {verified && (
          <p className="mt-1.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
            {loggerName(verifiedBy)}{verifiedAt ? ` · ${verifiedAt.slice(0, 10)}` : ''}
          </p>
        )}
      </div>

      {(error || missingMessage) && <p className="mt-4 text-sm text-priority-p1">{error ?? missingMessage}</p>}
    </Drawer>
  );
}
