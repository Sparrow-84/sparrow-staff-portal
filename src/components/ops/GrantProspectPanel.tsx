import { useCallback, useEffect, useRef, useState } from 'react';
import { Drawer } from '@/components/lcp/Drawer';
import { InfoTip } from '@/components/InfoTip';
import { useRequiredFields } from '@/hooks/useRequiredFields';
import {
  addProspectLink,
  deleteProspectDocument,
  deleteProspectLink,
  fetchProspectDocuments,
  fetchProspectLinks,
  getProspectDocumentUrl,
  markProspectAwarded,
  updateProspect,
  updateProspectDocumentSummary,
  uploadProspectDocument,
  type ProspectInput,
} from '@/lib/grant-prospects';
import {
  PROSPECT_STATUSES,
  prospectStatusChip,
  type GrantProspect,
  type GrantProspectDocument,
  type GrantProspectLink,
  type GrantProspectStatus,
} from '@/lib/grant-prospects-types';
import { formatDate } from '@/lib/grants-types';
import type { Profile } from '@/lib/types';
import { GrantProspectLabelPicker } from './GrantProspectLabelPicker';

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
  const [links, setLinks] = useState<GrantProspectLink[]>([]);
  const [docs, setDocs] = useState<GrantProspectDocument[]>([]);

  const { missingMessage, validate, fieldClass, clear, reset: resetValidation } = useRequiredFields([
    { key: 'prospect-name', label: 'Name', valid: form.name.trim().length > 0 },
  ]);

  const reload = useCallback(async () => {
    if (!prospect) return;
    const [l, d] = await Promise.all([fetchProspectLinks(prospect.id), fetchProspectDocuments(prospect.id)]);
    setLinks(l);
    setDocs(d);
  }, [prospect]);

  useEffect(() => {
    setForm(toInput(prospect));
    resetValidation();
    if (open) void reload();
  }, [prospect, open]);

  if (!prospect) return null;
  const prospectId = prospect.id;

  function set<K extends keyof ProspectInput>(key: K, value: ProspectInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!validate() || busy) return;
    setBusy(true);
    try {
      await updateProspect(prospectId, form);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: GrantProspectStatus) {
    if (status === 'awarded') {
      setBusy(true);
      try {
        const newGrantId = await markProspectAwarded(prospectId, currentUserId);
        onChanged();
        onAwarded(newGrantId);
      } finally {
        setBusy(false);
      }
      return;
    }
    set('status', status);
    setBusy(true);
    try {
      await updateProspect(prospectId, { status });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const showDecision = !['not_researched', 'researching'].includes(form.status);
  const showAction = ['decided_pursue', 'applied', 'awarded'].includes(form.status);

  return (
    <Drawer open={open} onClose={onClose} title={prospect.name} subtitle="Grant prospect">
      <div className="space-y-4">
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
          <span className="text-xs font-medium text-sparrow-gray">Name</span>
          <input
            id="prospect-name"
            value={form.name}
            onChange={(e) => { set('name', e.target.value); clear('prospect-name'); }}
            className={fieldClass('prospect-name')}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-sparrow-gray">
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
            <span className="text-xs font-medium text-sparrow-gray">
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
          <p className="mb-2 text-xs font-medium text-sparrow-gray">Status</p>
          <div className="flex flex-wrap gap-1.5">
            {PROSPECT_STATUSES.map((s) => (
              <button
                key={s.value}
                onClick={() => void setStatus(s.value)}
                disabled={busy}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  form.status === s.value
                    ? `border-transparent ${prospectStatusChip(s.value)}`
                    : 'border-sparrow-rule text-sparrow-gray hover:border-sparrow-green'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {MOVE_MESSAGE[form.status] && (
            <p className="mt-2 rounded-lg bg-sparrow-sage px-3 py-2 text-xs font-medium text-sparrow-green">
              {MOVE_MESSAGE[form.status]}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-sparrow-gray">Application opens</span>
            <input
              type="date"
              value={form.application_opens ?? ''}
              onChange={(e) => set('application_opens', e.target.value || null)}
              className="field-input"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-sparrow-gray">Application deadline</span>
            <input
              type="date"
              value={form.application_deadline ?? ''}
              onChange={(e) => set('application_deadline', e.target.value || null)}
              className="field-input"
            />
          </label>
        </div>
        <p className="text-[11px] text-sparrow-gray">Both dates are always visible, not gated by status — you usually learn these before you've decided anything.</p>

        <label className="block">
          <span className="text-xs font-medium text-sparrow-gray">
            Estimated amount
            <InfoTip text="Roughly what this opportunity is worth, if you know. If it gets awarded, this pre-fills the real grant record's amount — you can correct it there once you know the exact figure." />
          </span>
          <input
            type="number"
            value={form.est_amount ?? ''}
            onChange={(e) => set('est_amount', e.target.value === '' ? null : Number(e.target.value))}
            className="field-input"
          />
        </label>

        <LinksSection prospectId={prospect.id} links={links} currentUserId={currentUserId} onChanged={reload} />

        <DocumentsSection prospectId={prospect.id} docs={docs} currentUserId={currentUserId} onChanged={reload} />

        {form.status !== 'not_researched' && (
          <label className="block">
            <span className="text-xs font-medium text-sparrow-gray">Findings — what the research turned up</span>
            <textarea
              value={form.findings ?? ''}
              onChange={(e) => set('findings', e.target.value || null)}
              rows={3}
              className="field-input"
            />
          </label>
        )}

        {showDecision && (
          <label className="block">
            <span className="text-xs font-medium text-sparrow-gray">Decision reasoning — why pursue or not</span>
            <textarea
              value={form.decision_reasoning ?? ''}
              onChange={(e) => set('decision_reasoning', e.target.value || null)}
              rows={3}
              className="field-input"
            />
            <p className="mt-1 text-[11px] text-sparrow-gray">Only shown once a decision's been made — nothing to justify while still researching.</p>
          </label>
        )}

        {showAction && (
          <label className="block">
            <span className="text-xs font-medium text-sparrow-gray">Action steps</span>
            <textarea
              value={form.action_steps ?? ''}
              onChange={(e) => set('action_steps', e.target.value || null)}
              rows={3}
              className="field-input"
            />
            <p className="mt-1 text-[11px] text-sparrow-gray">Only shown once you've decided to pursue — no action steps for something you're not doing.</p>
          </label>
        )}

        {missingMessage && <p className="text-sm text-priority-p1">{missingMessage}</p>}
        <button onClick={save} disabled={busy} className="btn-primary w-full">
          Save changes
        </button>
      </div>
    </Drawer>
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
    findings: prospect.findings,
    decision_reasoning: prospect.decision_reasoning,
    action_steps: prospect.action_steps,
    owner_id: prospect.owner_id,
    lead_time_days: prospect.lead_time_days,
  };
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
      await addProspectLink(prospectId, label.trim(), url.trim(), currentUserId);
      setLabel('');
      setUrl('');
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-sparrow-gray">Links — add as many as you need</p>
      <div className="space-y-2 rounded-xl border border-sparrow-rule/70 p-3">
        {links.map((l) => (
          <div key={l.id} className="flex items-center gap-2 text-sm">
            <a href={l.url} target="_blank" rel="noreferrer" className="flex-1 truncate font-medium text-sparrow-green underline">
              {l.label}
            </a>
            <button onClick={() => deleteProspectLink(l.id).then(onChanged)} className="text-xs text-sparrow-gray hover:text-priority-p1">
              Remove
            </button>
          </div>
        ))}
        {links.length === 0 && <p className="text-xs text-sparrow-gray">No links yet.</p>}
        <div className="flex gap-2 border-t border-dashed border-sparrow-rule pt-2">
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
      <p className="mb-1 text-xs font-medium text-sparrow-gray">Documents — upload a file, optionally add a plain-English summary</p>
      <div className="space-y-3 rounded-xl border border-sparrow-rule/70 p-3">
        {docs.map((d) => (
          <div key={d.id}>
            <div className="flex items-center gap-2 text-sm">
              <button onClick={() => open(d)} className="flex-1 truncate text-left font-medium text-sparrow-green underline">
                {d.label}
              </button>
              <span className="text-xs text-sparrow-gray">{formatDate(d.created_at)}</span>
              <button onClick={() => deleteProspectDocument(d).then(onChanged)} className="text-xs text-sparrow-gray hover:text-priority-p1">
                Delete
              </button>
            </div>
            <ProspectDocumentSummary doc={d} onChanged={onChanged} />
          </div>
        ))}
        {docs.length === 0 && <p className="text-xs text-sparrow-gray">No documents yet.</p>}
        <div className="flex gap-2 border-t border-dashed border-sparrow-rule pt-2">
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
          <button onClick={() => { setDraft(doc.summary ?? ''); setEditing(false); }} className="text-xs text-sparrow-gray hover:text-sparrow-ink">Cancel</button>
        </div>
      </div>
    );
  }

  if (!doc.summary) {
    return (
      <button onClick={() => setEditing(true)} className="mt-1 text-xs text-sparrow-green hover:underline">
        + Add plain-English summary
      </button>
    );
  }

  return (
    <div className="mt-1">
      <button onClick={() => setExpanded((e) => !e)} className="flex items-center gap-1 text-xs font-medium text-sparrow-green hover:underline">
        <span aria-hidden>{expanded ? '▾' : '▸'}</span>
        Plain-English summary
      </button>
      {expanded && (
        <div className="mt-2 rounded-lg bg-sparrow-mist p-3">
          <p className="whitespace-pre-wrap text-xs text-sparrow-ink">{doc.summary}</p>
          <button onClick={() => setEditing(true)} className="mt-2 text-xs text-sparrow-gray hover:text-sparrow-ink">Edit</button>
        </div>
      )}
    </div>
  );
}
