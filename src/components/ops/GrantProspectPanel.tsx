import { useCallback, useEffect, useRef, useState } from 'react';
import { FullPageView, FullPageColumns } from './FullPageView';
import { InfoTip } from '@/components/InfoTip';
import { useRequiredFields } from '@/hooks/useRequiredFields';
import {
  addProspectContact,
  addProspectLink,
  addProspectUpdate,
  deleteProspectContact,
  deleteProspectDocument,
  deleteProspectLink,
  fetchProspectContacts,
  fetchProspectDocuments,
  fetchProspectLinks,
  fetchProspectUpdates,
  getProspectDocumentUrl,
  markProspectApplied,
  markProspectAwarded,
  markProspectDeclined,
  updateProspect,
  updateProspectDocumentSummary,
  updateProspectUpdate,
  uploadProspectDocument,
  type ProspectInput,
} from '@/lib/grant-prospects';
import {
  PROSPECT_STATUSES,
  prospectNotes,
  prospectStatusChip,
  type GrantProspect,
  type GrantProspectContact,
  type GrantProspectDocument,
  type GrantProspectLink,
  type GrantProspectStatus,
  type GrantProspectUpdate,
} from '@/lib/grant-prospects-types';
import { formatDate } from '@/lib/grants-types';
import type { Profile } from '@/lib/types';
import { GrantProspectLabelPicker } from './GrantProspectLabelPicker';
import { UpdatesTimeline } from './UpdatesTimeline';
import { externalHref } from '@/lib/external-url';
import { RichTextField, toEditableHtml } from '@/components/lcp/RichText';

/** Shown in red next to Save when an autosave fails — never fail silently on someone's notes. */
const SAVE_FAILED = '⚠ Not saved — check your internet, then click Save changes. Copy your notes somewhere safe before refreshing.';

/** Everything the autosave/Save button writes. Status is left out on purpose: it's saved
 * on its own the moment a status button is clicked (and by Applied/Outcome), so a stale
 * copy here can never undo a status change made a second ago. */
function editableFields(form: ProspectInput): Partial<ProspectInput> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { status: _status, ...rest } = form;
  return rest;
}

// Local calendar day — toISOString() is UTC, so after ~5pm Pacific it returned tomorrow.
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const MOVE_MESSAGE: Partial<Record<GrantProspectStatus, string>> = {
  decided_no: '→ Moves to the "Not Moving Forward" tab.',
  awarded: '🎉 Awarded! This will create a real record in "Active Grants" — the prospect closes out as done.',
};

export function GrantProspectPanel({
  open,
  prospect,
  currentUserId,
  profiles,
  onClose,
  onChanged,
  onAwarded,
}: {
  open: boolean;
  prospect: GrantProspect | null;
  currentUserId: string;
  profiles: Profile[];
  onClose: () => void;
  onChanged: () => void;
  onAwarded: (newGrantId: string) => void;
}) {
  const [form, setForm] = useState<ProspectInput>(() => toInput(prospect));
  const [busy, setBusy] = useState(false);
  const [autoSaveLabel, setAutoSaveLabel] = useState<string | null>(null);
  const [links, setLinks] = useState<GrantProspectLink[]>([]);
  const [docs, setDocs] = useState<GrantProspectDocument[]>([]);
  const [contacts, setContacts] = useState<GrantProspectContact[]>([]);
  const [updates, setUpdates] = useState<GrantProspectUpdate[]>([]);
  const skipNextAutosave = useRef(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [milestoneRequest, setMilestoneRequest] = useState<{ kind: 'applied' | 'awarded'; n: number } | null>(null);

  const { validate, fieldClass, fieldError, clear, reset: resetValidation } = useRequiredFields([
    { key: 'prospect-name', label: 'Name', valid: form.name.trim().length > 0 },
  ]);

  const reload = useCallback(async () => {
    if (!prospect) return;
    const [l, d, c, u] = await Promise.all([
      fetchProspectLinks(prospect.id),
      fetchProspectDocuments(prospect.id),
      fetchProspectContacts(prospect.id),
      fetchProspectUpdates(prospect.id),
    ]);
    setLinks(l);
    setDocs(d);
    setContacts(c);
    setUpdates(u);
  }, [prospect]);

  // Reset the form ONLY when a different prospect is opened. Every autosave refreshes the
  // table, which hands this panel a fresh copy of the same prospect — resetting on that
  // used to overwrite the boxes with the just-saved (slightly older) text, which threw the
  // cursor to the bottom and could eat whatever was typed during the save.
  const loadedIdRef = useRef<string | null>(prospect?.id ?? null);
  // The edit waiting out the autosave delay. Sent right away (instead of dropped) if a
  // different prospect is opened or the room is left before the delay is up.
  const pendingSave = useRef<{ id: string; data: Partial<ProspectInput> } | null>(null);
  const flushPendingSave = () => {
    const p = pendingSave.current;
    if (!p) return;
    pendingSave.current = null;
    void updateProspect(p.id, p.data).then(onChanged, () => setAutoSaveLabel(SAVE_FAILED));
  };
  useEffect(() => () => flushPendingSave(), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open) void reload();
    const id = prospect?.id ?? null;
    if (id === loadedIdRef.current) return;
    flushPendingSave();
    loadedIdRef.current = id;
    setForm(toInput(prospect));
    resetValidation();
    setAutoSaveLabel(null);
    skipNextAutosave.current = true;
  }, [prospect?.id, open]);

  // Status can change from outside the form (Applied / Outcome forms, the Award flow) —
  // pick that up without touching anything typed.
  useEffect(() => {
    if (!prospect) return;
    const s = prospect.status;
    setForm((f) => (f.status === s ? f : { ...f, status: s }));
  }, [prospect?.status]);

  // Autosave a few seconds after the last edit — the button stays for anyone who wants
  // the peace of mind of an explicit save, but nothing is lost if you just click away.
  // Must run before the `!prospect` early return below so this hook fires on every
  // render — skipping it when prospect is null changes the hook count between renders
  // and crashes the whole app the moment a row is clicked.
  useEffect(() => {
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return;
    }
    if (!prospect || !form.name.trim()) return; // don't autosave over a required field left blank
    const id = prospect.id;
    const data = editableFields(form);
    pendingSave.current = { id, data };
    setAutoSaveLabel('Saving…');
    const t = setTimeout(() => {
      if (pendingSave.current?.data === data) pendingSave.current = null;
      updateProspect(id, data)
        .then(() => { setAutoSaveLabel('Saved'); onChanged(); })
        .catch(() => setAutoSaveLabel(SAVE_FAILED));
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  if (!prospect) return null;
  const prospectId = prospect.id;

  function set<K extends keyof ProspectInput>(key: K, value: ProspectInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!validate() || busy) return;
    setBusy(true);
    try {
      await updateProspect(prospectId, editableFields(form));
      setAutoSaveLabel(null);
      onChanged();
    } catch {
      setAutoSaveLabel(SAVE_FAILED);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: GrantProspectStatus) {
    // Applied/Awarded need a date — open the matching form below instead of flipping the
    // status bare. Saving that form flips the status on its own.
    if (status === 'applied' || status === 'awarded') {
      setMilestoneRequest({ kind: status, n: Date.now() });
      return;
    }
    const previous = form.status;
    set('status', status);
    setStatusError(null);
    setBusy(true);
    try {
      await updateProspect(prospectId, { status });
      onChanged();
    } catch {
      set('status', previous);
      setStatusError(
        status === 'waiting_to_open'
          ? `"Waiting to open" turns on once today's database update (0235) runs. Nothing else was affected.`
          : "Couldn't change the status — check your internet and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  // Before migration 0234 runs, the Award range column doesn't exist yet — show the box
  // but locked, rather than letting typing in it silently fail to save.
  const awardRangeReady = prospect.award_range !== undefined;

  return (
    <FullPageView
      open={open}
      onClose={onClose}
      title={prospect.name}
      subtitle="Grant prospect"
      headerExtra={
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${prospectStatusChip(form.status)}`}>
          {PROSPECT_STATUSES.find((s) => s.value === form.status)?.label}
        </span>
      }
    >
      <FullPageColumns
        left={
          <>
            <div className="grid grid-cols-2 gap-3">
              <GrantProspectLabelPicker
                kind="tier"
                kindDisplayName="Tier"
                value={form.tier_label_id}
                currentUserId={currentUserId}
                onChange={(id) => { set('tier_label_id', id); void updateProspect(prospectId, { tier_label_id: id }).then(onChanged); }}
              />
              <GrantProspectLabelPicker
                kind="source"
                kindDisplayName="Source"
                value={form.source_label_id}
                currentUserId={currentUserId}
                onChange={(id) => { set('source_label_id', id); void updateProspect(prospectId, { source_label_id: id }).then(onChanged); }}
              />
            </div>

            <label className="block" htmlFor="prospect-name">
              <span className="field-label-required text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray">Name</span>
              <input
                id="prospect-name"
                value={form.name}
                onChange={(e) => { set('name', e.target.value); clear('prospect-name'); }}
                className={fieldClass('prospect-name')}
              />
              {fieldError('prospect-name') && <p className="mt-1 text-xs text-priority-p1">{fieldError('prospect-name')}</p>}
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray">
                  Owner
                  <InfoTip text="Who's responsible for making sure this prospect actually gets researched and, if pursued, applied for on time. Reminders go to this person." />
                </span>
                <select
                  value={form.owner_id ?? ''}
                  onChange={(e) => set('owner_id', e.target.value || null)}
                  className="field-input"
                >
                  <option value="">Unassigned</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray">
                  Reminder lead time (days)
                  <InfoTip text="How many days before the application deadline the owner should get a reminder task. 30 is the default." />
                </span>
                <input
                  type="number"
                  value={form.lead_time_days}
                  onChange={(e) => set('lead_time_days', Number(e.target.value) || 0)}
                  className="field-input"
                />
              </label>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray">
                Status
                <InfoTip text="Applied and Awarded switch on by themselves when you fill in Applied Date or Outcome below. Clicking either one here just opens that form." />
              </p>
              <div className="flex flex-wrap gap-1.5">
                {PROSPECT_STATUSES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => void setStatus(s.value)}
                    disabled={busy}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      form.status === s.value
                        ? `border-transparent ${prospectStatusChip(s.value)}`
                        : 'border-sparrow-rule dark:border-sparrow-dark-border text-sparrow-gray dark:text-sparrow-dark-gray hover:border-sparrow-green dark:hover:border-sparrow-dark-green'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {statusError && <p className="mt-2 text-xs text-priority-p1">{statusError}</p>}
              {MOVE_MESSAGE[form.status] && (
                <p className="mt-2 rounded-lg bg-sparrow-sage dark:bg-sparrow-green/15 px-3 py-2 text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green">
                  {MOVE_MESSAGE[form.status]}
                </p>
              )}
            </div>

            <MilestoneFields
              prospect={prospect}
              updates={updates}
              openRequest={milestoneRequest}
              currentUserId={currentUserId}
              onAwarded={onAwarded}
              onChanged={() => { onChanged(); void reload(); }}
            />

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray">Application opens</span>
                <input
                  type="date"
                  value={form.application_opens ?? ''}
                  onChange={(e) => set('application_opens', e.target.value || null)}
                  className="field-input"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray">Application deadline</span>
                <input
                  type="date"
                  value={form.application_deadline ?? ''}
                  onChange={(e) => set('application_deadline', e.target.value || null)}
                  className="field-input"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray">
                Award range
                <InfoTip text="What this funder gives, written the way they publish it — e.g. $5,000, $20k–$60k, or up to $15k." />
              </span>
              <input
                value={form.award_range ?? ''}
                onChange={(e) => set('award_range', e.target.value || null)}
                disabled={!awardRangeReady}
                placeholder="e.g. $5,000 or $20k–$60k"
                className="field-input disabled:opacity-60"
              />
              {!awardRangeReady && (
                <p className="mt-1 text-[11px] text-sparrow-gray dark:text-sparrow-dark-gray">Opens for typing once today's database update (0234) runs.</p>
              )}
            </label>

            <ContactsSection prospectId={prospect.id} contacts={contacts} currentUserId={currentUserId} onChanged={reload} />

            <LinksSection prospectId={prospect.id} links={links} currentUserId={currentUserId} onChanged={reload} />

            <DocumentsSection prospectId={prospect.id} docs={docs} currentUserId={currentUserId} onChanged={reload} />
          </>
        }
        right={
          <>
            {/* A div, not a <label>: clicking inside a label "clicks" its first button, which
                here would be Bold. */}
            <div>
              <span className="text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray">
                Notes
                <InfoTip text="Everything worth knowing about this opportunity — what the research turned up, eligibility, and why we're pursuing it or not. Bold, italics and lists work, and pasting from a website or Google Doc keeps its bold and lists (not its fonts or colors)." />
              </span>
              <RichTextField
                key={prospectId}
                initialValue={toEditableHtml(prospectNotes(prospect))}
                onChange={(html) => set('findings', html || null)}
                minHeightRem={26}
                toolbar
                numberedList
              />
            </div>

            <label className="block">
              <span className="text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray">Action steps</span>
              <textarea
                value={form.action_steps ?? ''}
                onChange={(e) => set('action_steps', e.target.value || null)}
                rows={7}
                className="field-input resize-y leading-relaxed"
              />
            </label>

            <div className="flex items-center justify-end gap-3">
              {autoSaveLabel && (
                <span className={`text-[11px] ${autoSaveLabel === SAVE_FAILED ? 'font-semibold text-priority-p1' : 'text-sparrow-gray dark:text-sparrow-dark-gray'}`}>{autoSaveLabel}</span>
              )}
              <button onClick={save} disabled={busy} className="btn-primary">
                Save changes
              </button>
            </div>

            <UpdatesTimeline
              key={prospectId}
              entries={updates}
              busy={busy}
              onAdd={async (body, happenedOn) => {
                await addProspectUpdate(prospectId, body, null, currentUserId, happenedOn);
                await reload();
              }}
              onEdit={async (id, patch) => {
                await updateProspectUpdate(id, patch);
                await reload();
              }}
            />
          </>
        }
      />
    </FullPageView>
  );
}

// ── Applied Date / Outcome — structured milestone fields, always visible, never buried
// in the Updates log below. Marking either one sets the date (sortable/visible in the
// quick-view table) and drops a matching gold-badged entry into Updates at the same time. ──
function MilestoneFields({
  prospect,
  updates,
  openRequest,
  currentUserId,
  onAwarded,
  onChanged,
}: {
  prospect: GrantProspect;
  updates: GrantProspectUpdate[];
  /** Set when the Applied/Awarded status chip is clicked — opens the matching form so the
   * date gets recorded instead of the status flipping with no date behind it. */
  openRequest: { kind: 'applied' | 'awarded'; n: number } | null;
  currentUserId: string;
  onAwarded: (newGrantId: string) => void;
  onChanged: () => void;
}) {
  // The "What was submitted, and to whom?" note lives in the Updates log as an "Applied"
  // entry — show the newest one right under the date so it's visible where it was typed.
  // (updates is sorted newest first; the bare "Applied." placeholder isn't worth showing.)
  const appliedEntry = updates.find((u) => u.milestone === 'Applied');
  const savedAppliedNote = appliedEntry && appliedEntry.body !== 'Applied.' ? appliedEntry.body : '';

  const [appliedOpen, setAppliedOpen] = useState(false);
  const [appliedDate, setAppliedDate] = useState(todayIso());
  const [appliedNote, setAppliedNote] = useState('');

  function openApplied() {
    setAppliedDate(prospect.applied_date ?? todayIso());
    setAppliedNote(savedAppliedNote);
    setAppliedOpen(true);
  }

  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [outcomeResult, setOutcomeResult] = useState<'Awarded' | 'Declined'>('Awarded');
  const [outcomeDate, setOutcomeDate] = useState(todayIso());
  const [outcomeNote, setOutcomeNote] = useState('');

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!openRequest) return;
    if (openRequest.kind === 'applied') openApplied();
    else {
      setOutcomeResult('Awarded');
      setOutcomeDate(todayIso());
      setOutcomeOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest]);

  async function confirmApplied() {
    setBusy(true);
    try {
      // Editing → correct the existing "Applied" Updates entry in place (text + date)
      // rather than stacking a second one.
      await markProspectApplied(prospect.id, appliedDate, appliedNote.trim() || null, currentUserId, prospect.status, appliedEntry?.id);
      setAppliedOpen(false);
      setAppliedNote('');
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function confirmOutcome() {
    setBusy(true);
    try {
      if (outcomeResult === 'Awarded') {
        const newGrantId = await markProspectAwarded(prospect.id, currentUserId, outcomeDate, outcomeNote.trim() || undefined);
        onAwarded(newGrantId);
      } else {
        await markProspectDeclined(prospect.id, outcomeDate, outcomeNote.trim() || null, currentUserId);
        onChanged();
      }
      setOutcomeOpen(false);
      setOutcomeNote('');
    } finally {
      setBusy(false);
    }
  }

  return (
    // While a form is open, go to one column so its inputs get the panel's full width
    // (squeezed into half, the Awarded/Declined picker collapsed to just its arrow).
    <div className={`grid gap-3 rounded-xl bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-3 ${appliedOpen || outcomeOpen ? 'grid-cols-1' : 'grid-cols-2'}`}>
      <div className="flex flex-col gap-1">
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Applied Date</span>
        {prospect.applied_date ? (
          <span className="text-sm font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">{formatDate(prospect.applied_date)}</span>
        ) : (
          <span className="text-sm italic text-sparrow-gray dark:text-sparrow-dark-gray">Not yet applied</span>
        )}
        {prospect.applied_date && savedAppliedNote && !appliedOpen && (
          <p className="whitespace-pre-wrap text-xs text-sparrow-ink dark:text-sparrow-dark-ink">{savedAppliedNote}</p>
        )}
        {!appliedOpen && (
          <button onClick={openApplied} className="mt-1 self-start text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline">
            {prospect.applied_date ? 'Edit Applied Date' : 'Mark as Applied'}
          </button>
        )}
        {appliedOpen && (
          <div className="mt-1 space-y-2 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-3">
            <label className="block">
              <span className="text-[11px] font-medium text-sparrow-gray dark:text-sparrow-dark-gray">Date applied</span>
              <input type="date" value={appliedDate} onChange={(e) => setAppliedDate(e.target.value)} className="field-input mt-0.5 text-sm" />
            </label>
            <textarea
              value={appliedNote}
              onChange={(e) => setAppliedNote(e.target.value)}
              rows={3}
              placeholder="What was submitted, and to whom?"
              className="field-input mt-0 text-xs"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setAppliedOpen(false)} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink">Cancel</button>
              <button onClick={confirmApplied} disabled={busy} className="btn-primary text-xs">Save</button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Outcome</span>
        {prospect.outcome_date ? (
          <span className="text-sm font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">
            {prospect.status === 'awarded' ? 'Awarded 🎉' : 'Declined'} — {formatDate(prospect.outcome_date)}
          </span>
        ) : (
          <span className="text-sm italic text-sparrow-gray dark:text-sparrow-dark-gray">Pending</span>
        )}
        {!outcomeOpen && !prospect.outcome_date && (
          <button onClick={() => { setOutcomeDate(todayIso()); setOutcomeOpen(true); }} className="mt-1 self-start text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline">
            Record Outcome
          </button>
        )}
        {outcomeOpen && (
          <div className="mt-1 space-y-2 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] font-medium text-sparrow-gray dark:text-sparrow-dark-gray">Result</span>
                <select value={outcomeResult} onChange={(e) => setOutcomeResult(e.target.value as 'Awarded' | 'Declined')} className="field-input mt-0.5 text-sm">
                  <option value="Awarded">Awarded</option>
                  <option value="Declined">Declined</option>
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-sparrow-gray dark:text-sparrow-dark-gray">Date we heard</span>
                <input type="date" value={outcomeDate} onChange={(e) => setOutcomeDate(e.target.value)} className="field-input mt-0.5 text-sm" />
              </label>
            </div>
            <textarea
              value={outcomeNote}
              onChange={(e) => setOutcomeNote(e.target.value)}
              rows={3}
              placeholder="Any detail worth keeping (amount, reason, next step)"
              className="field-input mt-0 text-xs"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setOutcomeOpen(false)} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink">Cancel</button>
              <button onClick={confirmOutcome} disabled={busy} className="btn-primary text-xs">Save</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function toInput(prospect: GrantProspect | null): ProspectInput {
  if (!prospect) {
    return {
      name: '',
      tier_label_id: null,
      source_label_id: null,
      status: 'not_researched',
      application_opens: null,
      application_deadline: null,
      est_amount: null,
      findings: null,
      decision_reasoning: null,
      action_steps: null,
      owner_id: null,
      lead_time_days: 30,
    };
  }
  return {
    name: prospect.name,
    tier_label_id: prospect.tier_label_id,
    source_label_id: prospect.source_label_id,
    status: prospect.status,
    application_opens: prospect.application_opens,
    application_deadline: prospect.application_deadline,
    est_amount: prospect.est_amount,
    // Only once migration 0234 has added the column — sending it before then would make
    // every save of this prospect fail.
    ...(prospect.award_range !== undefined ? { award_range: prospect.award_range } : {}),
    // One Notes box: any old Decision reasoning text is folded in (see prospectNotes), and
    // saving clears the old field so it isn't shown twice.
    findings: prospectNotes(prospect),
    decision_reasoning: null,
    action_steps: prospect.action_steps,
    owner_id: prospect.owner_id,
    lead_time_days: prospect.lead_time_days,
  };
}

// ── Contacts — always visible regardless of status; a "Not Moving Forward" prospect
// can still be revisited later, and the point of this section is that info about a
// person doesn't get lost or buried in the Findings text just because the status did ──
function ContactsSection({
  prospectId,
  contacts,
  currentUserId,
  onChanged,
}: {
  prospectId: string;
  contacts: GrantProspectContact[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await addProspectContact(
        prospectId,
        { name: name.trim(), email: email.trim() || null, phone: phone.trim() || null, note: note.trim() || null },
        currentUserId,
      );
      setName('');
      setEmail('');
      setPhone('');
      setNote('');
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray">
        Contacts — add as many as you need
      </p>
      <div className="space-y-2 rounded-xl border border-sparrow-rule/70 p-3">
        {contacts.map((c) => (
          <div key={c.id} className="flex items-start justify-between gap-2 rounded-lg bg-sparrow-mist/50 dark:bg-sparrow-dark-surface2/50 p-2 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{c.name}</p>
              <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                {c.email && <a href={`mailto:${c.email}`} className="underline">{c.email}</a>}
                {c.email && c.phone && ' · '}
                {c.phone && <a href={`tel:${c.phone}`} className="underline">{c.phone}</a>}
              </p>
              {c.note && <p className="mt-0.5 text-xs italic text-sparrow-gray dark:text-sparrow-dark-gray">{c.note}</p>}
            </div>
            <button
              onClick={() => deleteProspectContact(c.id).then(onChanged)}
              className="shrink-0 text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-priority-p1"
            >
              Remove
            </button>
          </div>
        ))}
        {contacts.length === 0 && <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">No contacts yet.</p>}
        <div className="grid grid-cols-2 gap-2 border-t border-dashed border-sparrow-rule dark:border-sparrow-dark-border pt-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="field-input mt-0 text-xs" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="field-input mt-0 text-xs" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="field-input mt-0 text-xs" />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (title, how connected, etc.)"
            className="field-input mt-0 text-xs"
          />
          <button onClick={add} disabled={busy || !name.trim()} className="btn-primary col-span-2 text-xs">
            + Add contact
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Links — always visible, not gated by status ─────────────────────────────────────
function LinksSection({
  prospectId,
  links,
  currentUserId,
  onChanged,
}: {
  prospectId: string;
  links: GrantProspectLink[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!label.trim() || !url.trim() || busy) return;
    setBusy(true);
    try {
      await addProspectLink(prospectId, label.trim(), externalHref(url), currentUserId);
      setLabel('');
      setUrl('');
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray">Links — add as many as you need</p>
      <div className="space-y-2 rounded-xl border border-sparrow-rule/70 p-3">
        {links.map((l) => (
          <div key={l.id} className="flex items-center gap-2 text-sm">
            <a href={externalHref(l.url)} target="_blank" rel="noreferrer" className="flex-1 truncate font-medium text-sparrow-green dark:text-sparrow-dark-green underline">
              {l.label}
            </a>
            <button onClick={() => deleteProspectLink(l.id).then(onChanged)} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-priority-p1">
              Remove
            </button>
          </div>
        ))}
        {links.length === 0 && <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">No links yet.</p>}
        <div className="flex gap-2 border-t border-dashed border-sparrow-rule dark:border-sparrow-dark-border pt-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Application portal)" className="field-input mt-0 flex-1 text-xs" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="field-input mt-0 flex-1 text-xs" />
          <button onClick={add} disabled={busy} className="btn-primary shrink-0 text-xs">
            + Add
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Documents — same pattern as Active Grants: upload + optional plain-English summary ──
function DocumentsSection({
  prospectId,
  docs,
  currentUserId,
  onChanged,
}: {
  prospectId: string;
  docs: GrantProspectDocument[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!label.trim() || !file || busy) return;
    setBusy(true);
    try {
      await uploadProspectDocument(prospectId, label.trim(), file, currentUserId);
      setLabel('');
      if (fileRef.current) fileRef.current.value = '';
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function open(doc: GrantProspectDocument) {
    const url = await getProspectDocumentUrl(doc.storage_path);
    window.open(url, '_blank', 'noreferrer');
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray">Documents — upload a file, optionally add a plain-English summary</p>
      <div className="space-y-3 rounded-xl border border-sparrow-rule/70 p-3">
        {docs.map((d) => (
          <div key={d.id}>
            <div className="flex items-center gap-2 text-sm">
              <button onClick={() => open(d)} className="flex-1 truncate text-left font-medium text-sparrow-green dark:text-sparrow-dark-green underline">
                {d.label}
              </button>
              <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{formatDate(d.created_at)}</span>
              <button onClick={() => deleteProspectDocument(d).then(onChanged)} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-priority-p1">
                Delete
              </button>
            </div>
            <ProspectDocumentSummary doc={d} onChanged={onChanged} />
          </div>
        ))}
        {docs.length === 0 && <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">No documents yet.</p>}
        <div className="flex gap-2 border-t border-dashed border-sparrow-rule dark:border-sparrow-dark-border pt-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Eligibility form)" className="field-input mt-0 flex-1 text-xs" />
          <input ref={fileRef} type="file" className="field-input mt-0 flex-1 text-xs" />
          <button onClick={upload} disabled={busy} className="btn-primary shrink-0 text-xs">
            Upload
          </button>
        </div>
      </div>
    </div>
  );
}

function ProspectDocumentSummary({ doc, onChanged }: { doc: GrantProspectDocument; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(doc.summary ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setDraft(doc.summary ?? ''); }, [doc.summary]);

  async function save() {
    setBusy(true);
    try {
      await updateProspectDocumentSummary(doc.id, draft.trim() || null);
      setEditing(false);
      setExpanded(true);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-2 space-y-2">
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} placeholder="Plain-English summary of what this document covers…" className="field-input mt-0 text-xs" />
        <div className="flex gap-2">
          <button onClick={save} disabled={busy} className="btn-primary text-xs">Save summary</button>
          <button onClick={() => { setDraft(doc.summary ?? ''); setEditing(false); }} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink">Cancel</button>
        </div>
      </div>
    );
  }

  if (!doc.summary) {
    return (
      <button onClick={() => setEditing(true)} className="mt-1 text-xs text-sparrow-green dark:text-sparrow-dark-green hover:underline">
        + Add plain-English summary
      </button>
    );
  }

  return (
    <div className="mt-1">
      <button onClick={() => setExpanded((e) => !e)} className="flex items-center gap-1 text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline">
        <span aria-hidden>{expanded ? '▾' : '▸'}</span>
        Plain-English summary
      </button>
      {expanded && (
        <div className="mt-2 rounded-lg bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-3">
          <p className="whitespace-pre-wrap text-xs text-sparrow-ink dark:text-sparrow-dark-ink">{doc.summary}</p>
          <button onClick={() => setEditing(true)} className="mt-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink">Edit</button>
        </div>
      )}
    </div>
  );
}
