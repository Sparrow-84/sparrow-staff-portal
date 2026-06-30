import { useCallback, useEffect, useState } from 'react';
import type { Profile } from '@/lib/types';
import { fetchTouchpoints, logTouchpoint, updatePartner } from '@/lib/partnerships';
import {
  DONOR_TIER,
  DONOR_TIER_DESC,
  GIVING_METHODS,
  MOU_STATUS,
  PARTNER_STAGE,
  PARTNER_STAGE_DESC,
  PARTNER_TYPE,
  STEWARDSHIP,
  TOUCHPOINT_METHOD,
  TOUCHPOINT_METHODS,
  dueLabel,
  shortDate,
  showInactivePrompt,
  stewardshipStatus,
  type DonorTier,
  type MouStatus,
  type Partner,
  type PartnerStage,
  type Touchpoint,
  type TouchpointMethod,
} from '@/lib/partnerships-types';
import { Drawer } from '../lcp/Drawer';

const STAGES: PartnerStage[] = ['prospect', 'active', 'reengaging', 'lapsed', 'inactive'];
const TIERS: DonorTier[] = ['first_time', 'recurring', 'major', 'lapsed'];
const MOU_STATUSES: MouStatus[] = ['not_needed', 'needed', 'on_file'];

export function PartnerDetailPanel({
  open,
  partner,
  profiles,
  currentUserId,
  onClose,
  onChanged,
}: {
  open: boolean;
  partner: Partner | null;
  profiles: Profile[];
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [touchpoints, setTouchpoints] = useState<Touchpoint[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [editingInfo, setEditingInfo] = useState(false);

  // Log-touchpoint form
  const [method, setMethod] = useState<TouchpointMethod>('email');
  const [occurredOn, setOccurredOn] = useState('');
  const [summary, setSummary] = useState('');
  const [direction, setDirection] = useState<'outbound' | 'inbound'>('outbound');
  const [stageUpdate, setStageUpdate] = useState<PartnerStage>('active');
  const [donorTierUpdate, setDonorTierUpdate] = useState<DonorTier | ''>('');

  const partnerId = partner?.id;

  const reload = useCallback(async () => {
    if (!partnerId) return;
    const all = await fetchTouchpoints(partnerId);
    // Newest first
    setTouchpoints([...all].sort((a, b) =>
      new Date(b.occurred_on).getTime() - new Date(a.occurred_on).getTime()
    ));
  }, [partnerId]);

  useEffect(() => {
    if (open && partnerId) {
      setMethod('email');
      setOccurredOn(new Date().toISOString().slice(0, 10));
      setSummary('');
      setConfirmArchive(false);
      setLogOpen(false);
      setEditingInfo(false);
      void reload();
    }
  }, [open, partnerId, reload]);

  if (!partner) return null;

  const type = PARTNER_TYPE[partner.type];
  const status = stewardshipStatus(partner);
  const loggerName = (id: string | null) => (id ? profiles.find((p) => p.id === id)?.full_name ?? '—' : '—');
  const ownerProfiles = profiles.filter((p) => p.department === 'partnerships' || p.partnerships_access);

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
    if (!partner) return;
    setBusy(true);
    await logTouchpoint(
      { partner_id: partner.id, method, occurred_on: occurredOn, summary: summary.trim() || null },
      currentUserId,
    );
    const patches: Parameters<typeof updatePartner>[1] = {};
    if (stageUpdate !== partner.stage) patches.stage = stageUpdate;
    if (isDonor && donorTierUpdate !== (partner.donor_tier ?? '')) {
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

  async function archive() {
    if (!partner) return;
    setBusy(true);
    await updatePartner(partner.id, { active: false, stage: 'inactive' });
    setBusy(false);
    setConfirmArchive(false);
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
          <section className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
            <p className="text-sm font-medium text-amber-900">No response in 60+ days</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800">
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
                  await logTouchpoint(
                    {
                      partner_id: partner.id,
                      method: 'other',
                      occurred_on: new Date().toISOString().slice(0, 10),
                      summary: 'Revisiting in 30 days.',
                    },
                    currentUserId,
                  );
                  await reload();
                  setBusy(false);
                  onChanged();
                }}
                disabled={busy}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-50 disabled:opacity-50"
              >
                Not yet — revisit in 30 days
              </button>
            </div>
          </section>
        )}

        {/* ── 3. Last touchpoint snippet ── */}
        {lastTouchpoint ? (
          <div className="rounded-xl border border-sparrow-rule/70 bg-sparrow-mist/40 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-sparrow-gray">Last touchpoint</span>
              <span className="text-xs text-sparrow-gray">
                {TOUCHPOINT_METHOD[lastTouchpoint.method]} · {shortDate(lastTouchpoint.occurred_on)}
              </span>
            </div>
            {lastTouchpoint.summary && (
              <p className="mt-1 line-clamp-2 text-xs text-sparrow-ink">{lastTouchpoint.summary}</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-sparrow-gray">No touchpoints logged yet.</p>
        )}

        {/* ── 4. Log touchpoint — collapsed behind a button ── */}
        <section>
          <button
            onClick={() => {
              if (!logOpen) {
                setDirection('outbound');
                setStageUpdate(partner.stage);
                setDonorTierUpdate(partner.donor_tier ?? '');
                setOccurredOn(new Date().toISOString().slice(0, 10));
                setSummary('');
              }
              setLogOpen((v) => !v);
            }}
            className={`w-full rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
              logOpen
                ? 'border-sparrow-rule bg-sparrow-mist text-sparrow-gray'
                : 'btn-primary'
            }`}
          >
            {logOpen ? '↑ Cancel' : '+ Log a touchpoint'}
          </button>

          {logOpen && (
            <div className="mt-3 space-y-3 rounded-xl border border-sparrow-rule p-3">

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
                        ? 'border-sparrow-green bg-sparrow-green/10 text-sparrow-green'
                        : 'border-sparrow-rule text-sparrow-gray hover:border-sparrow-green/40'
                    }`}
                  >
                    {dir === 'outbound' ? 'We reached out' : 'They reached out'}
                  </button>
                ))}
              </div>
              <p className="text-[11px] leading-snug text-sparrow-gray">
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
                  <span className="field-label">Date</span>
                  <input
                    type="date"
                    value={occurredOn}
                    onChange={(e) => setOccurredOn(e.target.value)}
                    className="field-input mt-0"
                  />
                </div>
              </div>

              {/* Notes */}
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={2}
                placeholder="What was discussed, any follow-up needed, etc. (optional)"
                className="field-input"
              />

              {/* Inline updates */}
              <div className="space-y-2 border-t border-sparrow-rule/60 pt-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-sparrow-gray">Also update (optional)</p>
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
                    <p className="mt-1 text-[11px] text-sparrow-green">Stage will update when you save ✓</p>
                  )}
                </div>
                {isDonor && (
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
                      <p className="mt-1 text-[11px] text-sparrow-green">Donor tier will update when you save ✓</p>
                    )}
                  </div>
                )}
              </div>

              <button onClick={log} disabled={busy || !occurredOn} className="btn-primary w-full">
                {busy ? 'Saving…' : 'Log touchpoint'}
              </button>
            </div>
          )}
        </section>

        {/* ── 5. Stewardship fields — always editable (change most often) ── */}
        <section className="space-y-3">
          <span className="field-label block">Stewardship</span>
          <div className="grid grid-cols-2 gap-3">
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
            <div>
              <span className="field-label">Cadence (days)</span>
              <input
                type="number"
                min={1}
                defaultValue={partner.cadence_days ?? ''}
                onBlur={(e) => {
                  const v = e.target.value ? Math.max(1, Number(e.target.value)) : null;
                  if (v !== (partner.cadence_days ?? null)) void patch({ cadence_days: v });
                }}
                placeholder="e.g. 90"
                disabled={busy}
                className="field-input mt-0"
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
            <p className="mt-1 text-[11px] leading-snug text-sparrow-gray">{PARTNER_STAGE_DESC[partner.stage]}</p>
          </div>
          {isDonor && (
            <div>
              <span className="field-label">Donor tier</span>
              <select
                value={partner.donor_tier ?? ''}
                onChange={(e) => void patch({ donor_tier: (e.target.value || null) as DonorTier | null })}
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
                <p className="mt-1 text-[11px] leading-snug text-sparrow-gray">{DONOR_TIER_DESC[partner.donor_tier]}</p>
              )}
            </div>
          )}
        </section>

        {/* ── 6. Partner info — view by default, edit on request ── */}
        {/* Key on edit state so uncontrolled inputs reset when toggling */}
        <section key={`info-${editingInfo}-${partner.id}`}>
          <div className="mb-2 flex items-center justify-between">
            <span className="field-label">Partner info</span>
            <button
              onClick={() => setEditingInfo((v) => !v)}
              className="text-xs font-medium text-sparrow-green hover:underline"
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
                  action={partner.email ? <a className="text-xs text-sparrow-green hover:underline" href={`mailto:${partner.email}`}>Email</a> : undefined}
                />
                <EditField
                  label="Phone"
                  value={partner.phone ?? ''}
                  disabled={busy}
                  onSave={(v) => void patch({ phone: v })}
                  action={partner.phone ? <a className="text-xs text-sparrow-green hover:underline" href={`tel:${partner.phone}`}>Call</a> : undefined}
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
                className="h-4 w-4 rounded border-sparrow-rule accent-sparrow-green"
              />
              <span className="text-sm text-sparrow-ink">Newsletter subscribed</span>
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
                <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  No MOU on file — needed for this relationship. Coordinate with Susanna to create one.
                </div>
              )}
              {partner.mou_status === 'on_file' && (
                <p className="mt-1 text-xs font-medium text-sparrow-green">On file ✓</p>
              )}
              <p className="mt-2 text-xs text-sparrow-gray">
                An MOU is needed when both organizations are formally doing something for each other — services, client referrals, or access to participants. If you're not sure, ask Susanna.
              </p>
            </div>
          </section>
        )}

        {/* ── 10. Touchpoint history ── */}
        <section>
          <span className="field-label">Touchpoint history</span>
          <ul className="mt-1 space-y-2">
            {touchpoints.length === 0 && <li className="text-sm text-sparrow-gray">No touchpoints logged yet.</li>}
            {touchpoints.map((t) => (
              <li key={t.id} className="rounded-xl border border-sparrow-rule/70 p-3">
                <div className="flex items-center justify-between text-xs text-sparrow-gray">
                  <span>{TOUCHPOINT_METHOD[t.method]} · {shortDate(t.occurred_on)}</span>
                  <span>{loggerName(t.logged_by)}</span>
                </div>
                {t.summary && <p className="mt-1 text-sm text-sparrow-ink">{t.summary}</p>}
              </li>
            ))}
          </ul>
        </section>

        {/* ── 11. Archive / Restore ── */}
        <section className="border-t border-sparrow-rule pt-4">
          {partner.active ? (
            confirmArchive ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-sparrow-ink">Archive {partner.name}?</span>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => setConfirmArchive(false)} className="btn-ghost">Cancel</button>
                  <button
                    onClick={archive}
                    disabled={busy}
                    className="rounded-xl bg-priority-p1 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    Archive
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmArchive(true)} className="text-xs font-medium text-sparrow-gray hover:text-priority-p1">
                Archive this partner
              </button>
            )
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-xs text-sparrow-gray">This partner is archived.</span>
              <button
                onClick={() => void patch({ active: true, stage: 'active' })}
                disabled={busy}
                className="text-xs font-medium text-sparrow-green hover:underline disabled:opacity-50"
              >
                Restore to active
              </button>
            </div>
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
      <span className="w-16 shrink-0 text-[11px] uppercase tracking-wide text-sparrow-gray">{label}</span>
      {href && value ? (
        <a href={href} className="min-w-0 flex-1 text-sm text-sparrow-green hover:underline">{display}</a>
      ) : (
        <span className={`min-w-0 flex-1 text-sm ${value ? 'text-sparrow-ink' : 'text-sparrow-gray/50'}`}>{display}</span>
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
        <span className="field-label">{label}</span>
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
