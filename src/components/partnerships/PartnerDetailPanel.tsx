import { useCallback, useEffect, useState } from 'react';
import { useRequiredFields } from '@/hooks/useRequiredFields';
import { localDate } from '@/lib/date';
import type { Profile } from '@/lib/types';
import { deletePartner, deleteTouchpoint, emitFirstTimeDonorTask, emitRevisitTask, fetchDonations, fetchTouchpoints, logTouchpoint, mergePartners, updatePartner, updateTouchpoint } from '@/lib/partnerships';
import {
  DONOR_TIER,
  DONOR_TIER_DESC,
  GIVING_METHODS,
  MOU_STATUS,
  PARTNER_STAGE,
  PARTNER_STAGE_DESC,
  PARTNER_TYPE,
  PARTNER_TYPES,
  STEWARDSHIP,
  TOUCHPOINT_METHOD,
  TOUCHPOINT_METHODS,
  dueLabel,
  shortDate,
  showInactivePrompt,
  stewardshipStatus,
  type Donation,
  type DonorStat,
  type DonorTier,
  type MouStatus,
  type Partner,
  type PartnerStage,
  type PartnerType,
  type Touchpoint,
  type TouchpointMethod,
} from '@/lib/partnerships-types';
import { Drawer } from '../lcp/Drawer';
import { RichTextView } from '../lcp/RichText';
import { RichTextEditor } from '../stories/RichTextEditor';
import { LEAD_TIME_PRESETS } from '@/lib/cadence';
import { CadenceInput } from './CadenceInput';
import { MultiSelectDropdown } from '@/components/MultiSelectDropdown';
import { createInterest, setPartnerInterests, type PartnershipInterest } from '@/lib/partnership-interests';
import { BusinessCardPhotos } from './BusinessCardPhotos';

// For the collapsed "last touchpoint" preview only -- the full note (with
// formatting) renders in the Touchpoint history list below via RichTextView.
function plainTextPreview(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const STAGES: PartnerStage[] = ['prospect', 'active', 'reengaging', 'inactive'];
const TIERS: DonorTier[] = ['first_time', 'recurring', 'major', 'lapsed'];
const MOU_STATUSES: MouStatus[] = ['not_needed', 'needed', 'on_file'];

export function PartnerDetailPanel({
  open,
  partner,
  partners,
  profiles,
  currentUserId,
  onClose,
  onChanged,
  donorStat = null,
  interests = [],
  selectedInterestIds = [],
  onInterestsCreated,
}: {
  open: boolean;
  partner: Partner | null;
  partners: Partner[];
  profiles: Profile[];
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
  donorStat?: DonorStat | null;
  interests?: PartnershipInterest[];
  selectedInterestIds?: string[];
  onInterestsCreated?: () => void;
}) {
  const [touchpoints, setTouchpoints] = useState<Touchpoint[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [editingInfo, setEditingInfo] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [confirmMerge, setConfirmMerge] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Edit/delete an existing touchpoint
  const [editingTouchpointId, setEditingTouchpointId] = useState<string | null>(null);
  const [editMethod, setEditMethod] = useState<TouchpointMethod>('email');
  const [editOccurredOn, setEditOccurredOn] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [touchpointSaving, setTouchpointSaving] = useState(false);
  const [deletingTouchpointId, setDeletingTouchpointId] = useState<string | null>(null);

  // Log-touchpoint form
  const [method, setMethod] = useState<TouchpointMethod>('email');
  const [occurredOn, setOccurredOn] = useState('');
  const [summary, setSummary] = useState('');
  const [direction, setDirection] = useState<'outbound' | 'inbound'>('outbound');
  const [stageUpdate, setStageUpdate] = useState<PartnerStage>('active');
  const [donorTierUpdate, setDonorTierUpdate] = useState<DonorTier | ''>('');

  const { fieldClass: logFieldClass, fieldError: logFieldError, clear: clearLogField, validate: validateLog } = useRequiredFields([
    { key: 'pdp-occurred-on', label: 'Date', valid: !!occurredOn },
  ]);

  const partnerId = partner?.id;

  const reload = useCallback(async () => {
    if (!partnerId) return;
    const [all, gifts] = await Promise.all([
      fetchTouchpoints(partnerId),
      partner?.type === 'donor' ? fetchDonations(partnerId) : Promise.resolve([]),
    ]);
    setTouchpoints([...all].sort((a, b) =>
      new Date(b.occurred_on).getTime() - new Date(a.occurred_on).getTime()
    ));
    setDonations(gifts);
  }, [partnerId, partner?.type]);

  useEffect(() => {
    if (open && partnerId) {
      setMethod('email');
      setOccurredOn(localDate());
      setSummary('');
      setConfirmArchive(false);
      setLogOpen(false);
      setEditingInfo(false);
      setMergeOpen(false);
      setMergeTargetId('');
      setConfirmMerge(false);
      setConfirmDelete(false);
      void reload();
    }
  }, [open, partnerId, reload]);

  if (!partner) return null;

  const type = PARTNER_TYPE[partner.type];
  const status = stewardshipStatus(partner);
  const loggerName = (id: string | null) => (id ? profiles.find((p) => p.id === id)?.full_name ?? '—' : '—');
  // Standing ownership map: Bethany (dept=partnerships) + anyone explicitly granted room
  // access. Exec is excluded even if flagged with partnerships_access — Andrew's only role
  // here is the one-time major-donor call task; he should never appear as a selectable
  // standing owner.
  const ownerProfiles = profiles.filter(
    (p) => (p.department === 'partnerships' || p.partnerships_access) && p.department !== 'exec',
  );

  const isDonor = partner.type === 'donor';
  const isCommunityOrChurch = partner.type === 'community' || partner.type === 'church';
  const lastTouchpoint = touchpoints[0] ?? null;

  async function patch(p: Parameters<typeof updatePartner>[1]) {
    if (!partner) return;
    setBusy(true);
    await updatePartner(partner.id, p);
    setBusy(false);
    onChanged();
  }

  async function log() {
    if (!partner || !validateLog()) return;
    setBusy(true);
    await logTouchpoint(
      { partner_id: partner.id, method, occurred_on: occurredOn, summary: summary.trim() || null },
      currentUserId,
    );
    const patches: Parameters<typeof updatePartner>[1] = {};
    if (stageUpdate !== partner.stage) patches.stage = stageUpdate;
    if (donorTierUpdate !== (partner.donor_tier ?? '')) {
      patches.donor_tier = (donorTierUpdate || null) as DonorTier | null;
    }
    // Restore archived partner when they reach out
    if (direction === 'inbound' && !partner.active) patches.active = true;
    if (Object.keys(patches).length > 0) await updatePartner(partner.id, patches);
    setSummary('');
    setLogOpen(false);
    await reload();
    setBusy(false);
    onChanged();
  }

  function startEditTouchpoint(t: Touchpoint) {
    setEditingTouchpointId(t.id);
    setEditMethod(t.method);
    setEditOccurredOn(t.occurred_on);
    setEditSummary(t.summary ?? '');
  }

  function cancelEditTouchpoint() {
    setEditingTouchpointId(null);
  }

  async function saveEditTouchpoint() {
    if (!editingTouchpointId || !editOccurredOn || touchpointSaving) return;
    setTouchpointSaving(true);
    try {
      await updateTouchpoint(editingTouchpointId, {
        method: editMethod,
        occurred_on: editOccurredOn,
        summary: editSummary.trim() || null,
      });
      setEditingTouchpointId(null);
      await reload();
      onChanged();
    } finally {
      setTouchpointSaving(false);
    }
  }

  async function removeTouchpoint(id: string) {
    setDeletingTouchpointId(id);
    try {
      await deleteTouchpoint(id);
      await reload();
      onChanged();
    } finally {
      setDeletingTouchpointId(null);
    }
  }

  async function archive() {
    if (!partner) return;
    setBusy(true);
    await updatePartner(partner.id, { active: false, stage: 'inactive' });
    setBusy(false);
    setConfirmArchive(false);
    onChanged();
    onClose();
  }

  const mergeTarget = mergeTargetId ? partners.find((p) => p.id === mergeTargetId) ?? null : null;
  const mergeCandidates = [...partners]
    .filter((p) => p.id !== partner?.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  async function merge() {
    if (!partner || !mergeTargetId) return;
    setBusy(true);
    await mergePartners(partner.id, mergeTargetId);
    setBusy(false);
    setConfirmMerge(false);
    setMergeOpen(false);
    onChanged();
    onClose();
  }

  async function remove() {
    if (!partner) return;
    setBusy(true);
    await deletePartner(partner.id);
    setBusy(false);
    setConfirmDelete(false);
    onChanged();
    onClose();
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={partner.name}
      subtitle={`${type.icon} ${type.label}`}
    >
      <div className="space-y-5" key={partner.id}>

        {/* ── 1. Stewardship status banner ── */}
        <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${STEWARDSHIP[status].chip}`}>
          <span className="text-sm font-medium">{STEWARDSHIP[status].label}</span>
          <span className="text-xs">{dueLabel(partner)}</span>
        </div>

        {/* ── 2. 60-day inactive prompt ── */}
        {showInactivePrompt(partner) && (
          <section className="rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 px-4 py-3">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">No response in 60+ days</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
              You reached out to {partner.name} but haven't heard back. The default next step is to
              archive them — they stay in the database, keep receiving TSM, and you can always find
              them in the Archived tab if they re-engage later.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => void patch({ active: false, stage: 'inactive' })}
                disabled={busy}
                className="rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-900 disabled:opacity-50"
              >
                Archive
              </button>
              <button
                onClick={async () => {
                  setBusy(true);
                  await emitRevisitTask(
                    partner.id,
                    partner.name,
                    partner.owner_id ?? currentUserId,
                  ).catch(() => undefined);
                  setBusy(false);
                  onChanged();
                }}
                disabled={busy}
                className="rounded-lg border border-amber-300 dark:border-amber-500/30 bg-white dark:bg-sparrow-dark-surface px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-300 transition hover:bg-amber-50 dark:hover:bg-amber-500/15 disabled:opacity-50"
              >
                Not yet — revisit in 30 days
              </button>
            </div>
          </section>
        )}

        {/* ── 3. Last touchpoint snippet ── */}
        {lastTouchpoint ? (
          <div className="rounded-xl border border-sparrow-rule/70 bg-sparrow-mist/40 dark:bg-sparrow-dark-surface2 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray">Last touchpoint</span>
              <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                {TOUCHPOINT_METHOD[lastTouchpoint.method]} · {shortDate(lastTouchpoint.occurred_on)}
              </span>
            </div>
            {lastTouchpoint.summary && (
              <p className="mt-1 line-clamp-2 text-xs text-sparrow-ink dark:text-sparrow-dark-ink">{plainTextPreview(lastTouchpoint.summary)}</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">No touchpoints logged yet.</p>
        )}

        {/* ── 4. Log touchpoint — collapsed behind a button ── */}
        <section>
          <button
            onClick={() => {
              if (!logOpen) {
                setDirection('outbound');
                setStageUpdate(partner.stage);
                setDonorTierUpdate(partner.donor_tier ?? '');
                setOccurredOn(localDate());
                setSummary('');
              }
              setLogOpen((v) => !v);
            }}
            className={`w-full rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
              logOpen
                ? 'border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist dark:bg-sparrow-dark-surface2 text-sparrow-gray dark:text-sparrow-dark-gray'
                : 'btn-primary'
            }`}
          >
            {logOpen ? '↑ Cancel' : '+ Log a touchpoint'}
          </button>

          {logOpen && (
            <div className="mt-3 space-y-3 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border p-3">

              {/* Direction toggle */}
              <div className="grid grid-cols-2 gap-2">
                {(['outbound', 'inbound'] as const).map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => {
                      setDirection(dir);
                      if (dir === 'inbound') {
                        // They reached out = relationship alive = Active
                        setStageUpdate('active');
                      } else {
                        // We reached out to a cold partner = Re-engaging; otherwise no change
                        const isCold = stewardshipStatus(partner) === 'lapsed' || partner.stage === 'inactive';
                        setStageUpdate(isCold ? 'reengaging' : partner.stage);
                      }
                    }}
                    className={`rounded-lg border py-2 text-xs font-medium transition ${
                      direction === dir
                        ? 'border-sparrow-green dark:border-sparrow-dark-green bg-sparrow-green/10 text-sparrow-green dark:text-sparrow-dark-green'
                        : 'border-sparrow-rule dark:border-sparrow-dark-border text-sparrow-gray dark:text-sparrow-dark-gray hover:border-sparrow-green/40'
                    }`}
                  >
                    {dir === 'outbound' ? 'We reached out' : 'They reached out'}
                  </button>
                ))}
              </div>
              <p className="text-[11px] leading-snug text-sparrow-gray dark:text-sparrow-dark-gray">
                {direction === 'outbound'
                  ? 'Record your outreach. Stage and donor tier updates below if needed.'
                  : 'Record what they shared. Stage auto-set to Active — override below if needed.'}
              </p>

              {/* Method + Date */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="field-label">Method</span>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as TouchpointMethod)}
                    className="field-input mt-0"
                  >
                    {TOUCHPOINT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {TOUCHPOINT_METHOD[m]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="field-label field-label-required">Date</span>
                  <input
                    type="date"
                    value={occurredOn}
                    onChange={(e) => { setOccurredOn(e.target.value); clearLogField('pdp-occurred-on'); }}
                    className={logFieldClass('pdp-occurred-on', 'field-input mt-0')}
                  />
                  {logFieldError('pdp-occurred-on') && <p className="mt-1 text-xs text-priority-p1">{logFieldError('pdp-occurred-on')}</p>}
                </div>
              </div>

              {/* Notes */}
              <RichTextEditor
                value={summary}
                onChange={setSummary}
                placeholder="What was discussed, any follow-up needed, etc. (optional)"
                className="min-h-[6rem]"
              />

              {/* Inline updates */}
              <div className="space-y-2 border-t border-sparrow-rule/60 pt-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Also update (optional)</p>
                <div>
                  <span className="field-label">Stage</span>
                  <select
                    value={stageUpdate}
                    onChange={(e) => setStageUpdate(e.target.value as PartnerStage)}
                    className="field-input mt-0"
                  >
                    {STAGES.map((s) => (
                      <option key={s} value={s}>
                        {PARTNER_STAGE[s].label}
                      </option>
                    ))}
                  </select>
                  {stageUpdate !== partner.stage && (
                    <p className="mt-1 text-[11px] text-sparrow-green dark:text-sparrow-dark-green">Stage will update when you save ✓</p>
                  )}
                </div>
                <div>
                  <span className="field-label">Donor tier</span>
                  <select
                    value={donorTierUpdate}
                    onChange={(e) => setDonorTierUpdate(e.target.value as DonorTier | '')}
                    className="field-input mt-0"
                  >
                    <option value="">— no change —</option>
                    {TIERS.map((t) => (
                      <option key={t} value={t}>
                        {DONOR_TIER[t]}
                      </option>
                    ))}
                  </select>
                  {donorTierUpdate && donorTierUpdate !== (partner.donor_tier ?? '') && (
                    <p className="mt-1 text-[11px] text-sparrow-green dark:text-sparrow-dark-green">Donor tier will update when you save ✓</p>
                  )}
                </div>
              </div>

              <button onClick={log} disabled={busy} className="btn-primary w-full">
                {busy ? 'Saving…' : 'Log touchpoint'}
              </button>
            </div>
          )}
        </section>

        {/* ── 5. Stewardship fields — always editable (change most often) ── */}
        <section className="space-y-3">
          <span className="field-label block">Stewardship</span>
          <div>
            <span className="field-label">Type</span>
            <select
              value={partner.type}
              onChange={(e) => {
                const nextType = e.target.value as PartnerType;
                if (nextType === partner.type) return;
                // Changing the primary type shouldn't lose the old one — fold it into
                // secondary tags (and drop the new type from there if it was already tagged).
                const nextSecondary = Array.from(
                  new Set([...(partner.secondary_types ?? []).filter((t) => t !== nextType), partner.type]),
                );
                void patch({ type: nextType, secondary_types: nextSecondary });
              }}
              disabled={busy}
              className="field-input mt-0"
            >
              {PARTNER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PARTNER_TYPE[t].icon} {PARTNER_TYPE[t].label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] leading-snug text-sparrow-gray dark:text-sparrow-dark-gray">
              Drives cadence defaults and which fields show below. Changing it moves the old
              type down to "Also involved as" so it isn't lost.
            </p>
          </div>
          <div>
            <span className="field-label">Also involved as</span>
            <MultiSelectDropdown
              options={PARTNER_TYPES.filter((t) => t !== partner.type).map((t) => ({
                value: t,
                label: PARTNER_TYPE[t].label,
                icon: PARTNER_TYPE[t].icon,
              }))}
              selected={partner.secondary_types ?? []}
              onChange={(next) => void patch({ secondary_types: next as PartnerType[] })}
              disabled={busy}
              placeholder="None"
            />
            <p className="mt-1 text-[11px] leading-snug text-sparrow-gray dark:text-sparrow-dark-gray">
              Tags {partner.name} onto those Directory tabs too. The main Type above still
              drives cadence and which fields show below.
            </p>
          </div>
          <div>
            <span className="field-label">Owner</span>
            <select
              value={partner.owner_id ?? ''}
              onChange={(e) => void patch({ owner_id: e.target.value || null })}
              disabled={busy}
              className="field-input mt-0"
            >
              <option value="">Unassigned</option>
              {ownerProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="field-label">Cadence *</span>
              <CadenceInput
                value={partner.cadence_days}
                onCommit={(v) => void patch({ cadence_days: v })}
                disabled={busy}
              />
            </div>
            <div>
              <span className="field-label">Lead time *</span>
              <CadenceInput
                value={partner.lead_time_days}
                onCommit={(v) => void patch({ lead_time_days: v })}
                disabled={busy}
                presets={LEAD_TIME_PRESETS}
              />
            </div>
          </div>
          <div>
            <span className="field-label">Stage</span>
            <select
              value={partner.stage}
              onChange={(e) => void patch({ stage: e.target.value as PartnerStage })}
              disabled={busy}
              className="field-input mt-0"
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {PARTNER_STAGE[s].label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] leading-snug text-sparrow-gray dark:text-sparrow-dark-gray">{PARTNER_STAGE_DESC[partner.stage]}</p>
          </div>
          <div>
            <span className="field-label">Donor tier</span>
            <select
              value={partner.donor_tier ?? ''}
              onChange={async (e) => {
                const newTier = (e.target.value || null) as DonorTier | null;
                await patch({ donor_tier: newTier });
                if (newTier === 'first_time' && partner.owner_id) {
                  void emitFirstTimeDonorTask(partner.id, partner.name, partner.owner_id).catch(() => undefined);
                }
              }}
              disabled={busy}
              className="field-input mt-0"
            >
              <option value="">—</option>
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {DONOR_TIER[t]}
                </option>
              ))}
            </select>
            {partner.donor_tier && (
              <p className="mt-1 text-[11px] leading-snug text-sparrow-gray dark:text-sparrow-dark-gray">{DONOR_TIER_DESC[partner.donor_tier]}</p>
            )}
          </div>
        </section>

        {/* ── 6. Partner info — view by default, edit on request ── */}
        {/* Key on edit state so uncontrolled inputs reset when toggling */}
        <section key={`info-${editingInfo}-${partner.id}`}>
          <div className="mb-2 flex items-center justify-between">
            <span className="field-label">Partner info</span>
            <button
              onClick={() => setEditingInfo((v) => !v)}
              className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline"
            >
              {editingInfo ? 'Done editing' : 'Edit'}
            </button>
          </div>

          {!editingInfo ? (
            // View mode — clean readable rows
            <div className="space-y-1.5 rounded-xl border border-sparrow-rule/70 px-3 py-3">
              <InfoRow label="Name" value={partner.name} />
              <InfoRow label="Contact" value={partner.contact_name} />
              <InfoRow label="Org" value={partner.organization} />
              <InfoRow label="Email" value={partner.email} href={partner.email ? `mailto:${partner.email}` : undefined} />
              <InfoRow label="Phone" value={partner.phone} href={partner.phone ? `tel:${partner.phone}` : undefined} />
              <InfoRow label="Address" value={partner.address} />
              <InfoRow label="Source" value={partner.source} />
            </div>
          ) : (
            // Edit mode — same fields as before
            <div className="space-y-3">
              <EditField
                label="Name"
                value={partner.name}
                required
                disabled={busy}
                onSave={(v) => { if (v) void patch({ name: v }); }}
              />
              <div className="grid grid-cols-2 gap-3">
                <EditField label="Primary contact" value={partner.contact_name ?? ''} disabled={busy} onSave={(v) => void patch({ contact_name: v })} />
                <EditField label="Organization" value={partner.organization ?? ''} disabled={busy} onSave={(v) => void patch({ organization: v })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <EditField
                  label="Email"
                  type="email"
                  value={partner.email ?? ''}
                  disabled={busy}
                  onSave={(v) => void patch({ email: v })}
                  action={partner.email ? <a className="text-xs text-sparrow-green dark:text-sparrow-dark-green hover:underline" href={`mailto:${partner.email}`}>Email</a> : undefined}
                />
                <EditField
                  label="Phone"
                  value={partner.phone ?? ''}
                  disabled={busy}
                  onSave={(v) => void patch({ phone: v })}
                  action={partner.phone ? <a className="text-xs text-sparrow-green dark:text-sparrow-dark-green hover:underline" href={`tel:${partner.phone}`}>Call</a> : undefined}
                />
              </div>
              <div>
                <span className="field-label">Mailing address</span>
                <textarea
                  defaultValue={partner.address ?? ''}
                  onBlur={(e) => {
                    const v = e.target.value.trim() || null;
                    if (v !== (partner.address ?? null)) void patch({ address: v });
                  }}
                  rows={2}
                  placeholder="Street, city, state ZIP"
                  className="field-input"
                />
              </div>
              <EditField label="Source (how the connection was made)" value={partner.source ?? ''} disabled={busy} onSave={(v) => void patch({ source: v })} />
            </div>
          )}
        </section>

        {/* ── 6.4. Business card photo ── */}
        <section>
          <BusinessCardPhotos
            table="partners"
            recordId={partner.id}
            frontPath={partner.business_card_front_path}
            backPath={partner.business_card_back_path}
            onChanged={onChanged}
          />
        </section>

        {/* ── 6.5. Interests ── */}
        <section>
          <span className="field-label">Interests</span>
          <MultiSelectDropdown
            options={interests.map((i) => ({ value: i.id, label: i.label, color: i.color }))}
            selected={selectedInterestIds}
            onChange={(next) => {
              if (!partner) return;
              void setPartnerInterests(partner.id, next).then(() => onChanged());
            }}
            disabled={busy}
            placeholder="None"
            onCreateNew={async (label, color) => {
              await createInterest(label, color);
              onInterestsCreated?.();
            }}
          />
          <p className="mt-1 text-[11px] leading-snug text-sparrow-gray dark:text-sparrow-dark-gray">
            You can search Directory by an interest's name to pull up everyone tagged with it.
          </p>
        </section>

        {/* ── 7. Notes ── */}
        <section>
          <span className="field-label">Notes</span>
          <textarea
            defaultValue={partner.notes ?? ''}
            onBlur={(e) => {
              const v = e.target.value.trim() || null;
              if (v !== (partner.notes ?? null)) void patch({ notes: v });
            }}
            rows={3}
            placeholder="Context, commitments, history…"
            className="field-input"
          />
        </section>

        {/* ── 8. Donor details — bottom, donor only ── */}
        {isDonor && (
          <section className="space-y-3 rounded-xl border border-sparrow-rule/70 p-3">
            <span className="field-label block">Donor details</span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="field-label">Giving method</span>
                <select
                  value={partner.giving_method ?? ''}
                  onChange={(e) => void patch({ giving_method: e.target.value || null })}
                  disabled={busy}
                  className="field-input mt-0"
                >
                  <option value="">—</option>
                  {GIVING_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="field-label">First gift date</span>
                <input
                  type="date"
                  defaultValue={partner.first_gift_date ?? ''}
                  onBlur={(e) => {
                    const v = e.target.value || null;
                    if (v !== (partner.first_gift_date ?? null)) void patch({ first_gift_date: v });
                  }}
                  disabled={busy}
                  className="field-input mt-0"
                />
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={partner.newsletter_subscribed}
                onChange={(e) => void patch({ newsletter_subscribed: e.target.checked })}
                disabled={busy}
                className="h-4 w-4 rounded border-sparrow-rule dark:border-sparrow-dark-border accent-sparrow-green"
              />
              <span className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">Newsletter subscribed</span>
            </label>
          </section>
        )}

        {/* ── 9. Partnership terms — bottom, community/church only ── */}
        {isCommunityOrChurch && (
          <section className="space-y-3 rounded-xl border border-sparrow-rule/70 p-3">
            <span className="field-label block">Partnership terms</span>
            <div>
              <span className="field-label">What Sparrow provides</span>
              <textarea
                defaultValue={partner.sparrow_provides ?? ''}
                onBlur={(e) => {
                  const v = e.target.value.trim() || null;
                  if (v !== (partner.sparrow_provides ?? null)) void patch({ sparrow_provides: v });
                }}
                rows={2}
                placeholder="Services, support, or access Sparrow offers…"
                disabled={busy}
                className="field-input"
              />
            </div>
            <div>
              <span className="field-label">What they provide</span>
              <textarea
                defaultValue={partner.partner_provides ?? ''}
                onBlur={(e) => {
                  const v = e.target.value.trim() || null;
                  if (v !== (partner.partner_provides ?? null)) void patch({ partner_provides: v });
                }}
                rows={2}
                placeholder="Services, referrals, or resources they offer Sparrow…"
                disabled={busy}
                className="field-input"
              />
            </div>
            <div>
              <span className="field-label">MOU status</span>
              <select
                value={partner.mou_status ?? ''}
                onChange={(e) => void patch({ mou_status: (e.target.value || null) as MouStatus | null })}
                disabled={busy}
                className="field-input mt-0"
              >
                <option value="">—</option>
                {MOU_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {MOU_STATUS[s]}
                  </option>
                ))}
              </select>
              {partner.mou_status === 'needed' && (
                <div className="mt-2 rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                  No MOU on file — needed for this relationship. Coordinate with Susanna to create one.
                </div>
              )}
              {partner.mou_status === 'on_file' && (
                <p className="mt-1 text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green">On file ✓</p>
              )}
              <p className="mt-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                An MOU is needed when both organizations are formally doing something for each other — services, client referrals, or access to participants. If you're not sure, ask Susanna.
              </p>
            </div>
          </section>
        )}

        {/* ── 10. Touchpoint history ── */}
        <section>
          <span className="field-label">Touchpoint history</span>
          <ul className="mt-1 space-y-2">
            {touchpoints.length === 0 && <li className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No touchpoints logged yet.</li>}
            {touchpoints.map((t) => (
              <li key={t.id} className="group rounded-xl border border-sparrow-rule/70 p-3">
                {editingTouchpointId === t.id ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={editMethod}
                        onChange={(e) => setEditMethod(e.target.value as TouchpointMethod)}
                        className="field-input mt-0"
                      >
                        {TOUCHPOINT_METHODS.map((m) => (
                          <option key={m} value={m}>{TOUCHPOINT_METHOD[m]}</option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={editOccurredOn}
                        onChange={(e) => setEditOccurredOn(e.target.value)}
                        className="field-input mt-0"
                      />
                    </div>
                    <RichTextEditor value={editSummary} onChange={setEditSummary} className="min-h-[5rem]" />
                    <div className="flex justify-end gap-2">
                      <button onClick={cancelEditTouchpoint} className="text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink">
                        Cancel
                      </button>
                      <button
                        onClick={() => void saveEditTouchpoint()}
                        disabled={!editOccurredOn || touchpointSaving}
                        className="rounded-lg bg-sparrow-green px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {touchpointSaving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                      <span>{TOUCHPOINT_METHOD[t.method]} · {shortDate(t.occurred_on)}</span>
                      <div className="flex items-center gap-2">
                        <span>{loggerName(t.logged_by)}</span>
                        <button
                          onClick={() => startEditTouchpoint(t)}
                          title="Edit"
                          aria-label="Edit touchpoint"
                          className="opacity-0 hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink group-hover:opacity-100"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => void removeTouchpoint(t.id)}
                          disabled={deletingTouchpointId === t.id}
                          title="Delete"
                          aria-label="Delete touchpoint"
                          className="opacity-0 hover:text-priority-p1 group-hover:opacity-100 disabled:opacity-50"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 6h18" />
                            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    {t.summary && <RichTextView html={t.summary} />}
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* ── 11. Giving history (donors only) ── */}
        {isDonor && (
          <section>
            <div className="flex items-baseline justify-between">
              <span className="field-label">Giving history</span>
              {donorStat && donorStat.gift_count > 0 && (
                <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                  {donorStat.gift_count} gift{donorStat.gift_count > 1 ? 's' : ''} · last {shortDate(donorStat.last_gift_date)}
                </span>
              )}
            </div>

            {donations.length === 0 ? (
              <p className="mt-1 text-sm text-sparrow-gray/70">
                No gifts on record yet — any new Givebutter donation from this person will show up here automatically.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {donations.map((d) => (
                  <li key={d.id} className="rounded-xl border border-sparrow-rule/70 bg-white dark:bg-sparrow-dark-surface p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">
                          {shortDate(d.received_on)}
                          {d.amount_above_10k && (
                            <span className="rounded-full bg-sparrow-gold/20 px-2 py-0.5 text-[10px] font-medium text-sparrow-ink dark:text-sparrow-dark-ink">
                              $10k+
                            </span>
                          )}
                          {d.recurring && (
                            <span className="rounded-full bg-sparrow-green/10 px-2 py-0.5 text-[10px] font-medium text-sparrow-green dark:text-sparrow-dark-green">
                              Recurring
                            </span>
                          )}
                        </div>
                        {d.designation && (
                          <p className="mt-0.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{d.designation}</p>
                        )}
                      </div>
                      {d.giving_method && (
                        <span className="shrink-0 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{d.giving_method}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ── Merge into another partner — for a duplicate spotted any time, not just ones the sync flags ── */}
        <section className="border-t border-sparrow-rule dark:border-sparrow-dark-border pt-4">
          <button
            onClick={() => {
              if (!mergeOpen) {
                setMergeTargetId('');
                setConfirmMerge(false);
              }
              setMergeOpen((v) => !v);
            }}
            className="text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
          >
            {mergeOpen ? '↑ Cancel merge' : 'Merge into another partner…'}
          </button>

          {mergeOpen && (
            <div className="mt-3 space-y-3 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border p-3">
              <p className="text-xs leading-snug text-sparrow-gray dark:text-sparrow-dark-gray">
                Use this when you've spotted a duplicate — e.g. this donor already has a joint
                household record under a different name. Pick who {partner.name} should merge into.
              </p>
              <div>
                <span className="field-label">Merge into</span>
                <select
                  value={mergeTargetId}
                  onChange={(e) => { setMergeTargetId(e.target.value); setConfirmMerge(false); }}
                  className="field-input mt-0"
                >
                  <option value="">Select a partner…</option>
                  {mergeCandidates.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {mergeTarget && (
                <div className="space-y-2 rounded-xl bg-sparrow-mist/50 dark:bg-sparrow-dark-surface2 p-3">
                  <p className="text-xs font-medium text-sparrow-ink dark:text-sparrow-dark-ink">
                    This will move {touchpoints.length} touchpoint{touchpoints.length === 1 ? '' : 's'}
                    {isDonor && `, ${donations.length} gift${donations.length === 1 ? '' : 's'}`} from{' '}
                    <span className="font-semibold">{partner.name}</span> into{' '}
                    <span className="font-semibold">{mergeTarget.name}</span>, then delete {partner.name}.
                  </p>
                  {(partner.notes || mergeTarget.notes) && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="font-medium text-sparrow-gray dark:text-sparrow-dark-gray">{partner.name}'s notes (will be discarded)</p>
                        <p className="mt-0.5 whitespace-pre-wrap text-sparrow-ink dark:text-sparrow-dark-ink">{partner.notes || '—'}</p>
                      </div>
                      <div>
                        <p className="font-medium text-sparrow-gray dark:text-sparrow-dark-gray">{mergeTarget.name}'s notes (kept)</p>
                        <p className="mt-0.5 whitespace-pre-wrap text-sparrow-ink dark:text-sparrow-dark-ink">{mergeTarget.notes || '—'}</p>
                      </div>
                    </div>
                  )}
                  <p className="text-[11px] text-amber-800 dark:text-amber-300">
                    Copy anything worth keeping from {partner.name}'s notes into {mergeTarget.name}'s notes before
                    confirming — the merge does not combine them for you.
                  </p>
                </div>
              )}

              {mergeTargetId && !confirmMerge && (
                <button
                  onClick={() => setConfirmMerge(true)}
                  className="rounded-lg border border-priority-p1/40 bg-white dark:bg-sparrow-dark-surface px-3 py-1.5 text-xs font-medium text-priority-p1 transition hover:bg-priority-p1/5"
                >
                  Merge {partner.name} into {mergeTarget?.name}…
                </button>
              )}
              {confirmMerge && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-sparrow-ink dark:text-sparrow-dark-ink">This can't be undone. Merge now?</span>
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => setConfirmMerge(false)} className="btn-ghost">Cancel</button>
                    <button
                      onClick={merge}
                      disabled={busy}
                      className="rounded-lg bg-priority-p1 px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      {busy ? 'Merging…' : 'Merge'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── 12. Archive / Restore — the normal way to end a relationship that
            was real: history stays, reversible anytime from the Archived tab.
            Styled to stand out (pill, brand green) since this — not Delete
            below — is the button staff should reach for. ── */}
        <section className="border-t border-sparrow-rule dark:border-sparrow-dark-border pt-4">
          {partner.active ? (
            confirmArchive ? (
              <div className="space-y-2">
                <p className="text-xs leading-snug text-sparrow-gray dark:text-sparrow-dark-gray">
                  {partner.name} moves to the Archived tab — off your active list, but their full history stays and you can restore them anytime.
                </p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">Archive {partner.name}?</span>
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => setConfirmArchive(false)} className="btn-ghost">Cancel</button>
                    <button
                      onClick={archive}
                      disabled={busy}
                      className="rounded-full bg-sparrow-green dark:bg-sparrow-dark-green px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      {busy ? 'Archiving…' : 'Archive'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <button
                  onClick={() => setConfirmArchive(true)}
                  className="rounded-full bg-sparrow-green dark:bg-sparrow-dark-green px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                >
                  Archive this partner
                </button>
                <p className="text-[11px] leading-snug text-sparrow-gray dark:text-sparrow-dark-gray">
                  Use this when the relationship has genuinely ended. Their record and history stay — this is reversible from the Archived tab, unlike permanent delete below.
                </p>
              </div>
            )
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">This partner is archived.</span>
              <button
                onClick={() => void patch({ active: true, stage: 'active' })}
                disabled={busy}
                className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline disabled:opacity-50"
              >
                Restore to active
              </button>
            </div>
          )}
        </section>

        {/* ── 13. Delete — for a record that never should have been added (typo'd
            duplicate, wrong org, test entry), not a relationship that genuinely
            ended. That case is Archive, above, which is reversible. Deliberately
            kept as plain muted text, not a pill, so it doesn't compete with
            Archive as the button people reach for. ── */}
        <section className="border-t border-sparrow-rule dark:border-sparrow-dark-border pt-4">
          {confirmDelete ? (
            <div className="space-y-2">
              {(touchpoints.length > 0 || donations.length > 0) && (
                <p className="text-xs leading-snug text-amber-800 dark:text-amber-300">
                  {partner.name} has {touchpoints.length} touchpoint{touchpoints.length === 1 ? '' : 's'}
                  {isDonor && donations.length > 0 && ` and ${donations.length} logged gift${donations.length === 1 ? '' : 's'}`} on
                  record. Deleting removes the touchpoint history for good{isDonor && donations.length > 0 ? ' (gifts stay in the giving records, just unlinked from this partner)' : ''}.
                  If this was a real relationship, use Archive instead — it's reversible.
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">Permanently delete {partner.name}?</span>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => setConfirmDelete(false)} className="btn-ghost">Cancel</button>
                  <button
                    onClick={() => void remove()}
                    disabled={busy}
                    className="rounded-xl bg-priority-p1 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    {busy ? 'Deleting…' : 'Delete permanently'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray hover:text-priority-p1"
            >
              Permanently delete this partner
            </button>
          )}
        </section>

      </div>
    </Drawer>
  );
}

// ── Sub-components ──

function InfoRow({ label, value, href }: { label: string; value: string | null; href?: string }) {
  const display = value || '—';
  return (
    <div className="flex gap-3">
      <span className="w-16 shrink-0 text-[11px] uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">{label}</span>
      {href && value ? (
        <a href={href} className="min-w-0 flex-1 text-sm text-sparrow-green dark:text-sparrow-dark-green hover:underline">{display}</a>
      ) : (
        <span className={`min-w-0 flex-1 text-sm ${value ? 'text-sparrow-ink dark:text-sparrow-dark-ink' : 'text-sparrow-gray/50'}`}>{display}</span>
      )}
    </div>
  );
}

function EditField({
  label, value, onSave, type = 'text', placeholder, disabled, required, action,
}: {
  label: string; value: string; onSave: (v: string | null) => void;
  type?: string; placeholder?: string; disabled?: boolean; required?: boolean; action?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className={`field-label ${required ? 'field-label-required' : ''}`}>{label}</span>
        {action}
      </div>
      <input
        type={type}
        defaultValue={value}
        disabled={disabled}
        placeholder={placeholder}
        onBlur={(e) => {
          const trimmed = e.target.value.trim();
          if (required && !trimmed) { e.target.value = value; return; }
          const next = trimmed || null;
          if (next !== (value || null)) onSave(next);
        }}
        className="field-input mt-0"
      />
    </div>
  );
}
