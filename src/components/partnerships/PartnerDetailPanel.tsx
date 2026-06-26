import { useCallback, useEffect, useState } from 'react';
import type { Profile } from '@/lib/types';
import { fetchTouchpoints, logTouchpoint, updatePartner } from '@/lib/partnerships';
import {
  DONOR_TIER,
  GIVING_METHODS,
  MOU_STATUS,
  PARTNER_STAGE,
  PARTNER_TYPE,
  STEWARDSHIP,
  TOUCHPOINT_METHOD,
  TOUCHPOINT_METHODS,
  dueLabel,
  shortDate,
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

  // Log-touchpoint form
  const [method, setMethod] = useState<TouchpointMethod>('email');
  const [occurredOn, setOccurredOn] = useState('');
  const [summary, setSummary] = useState('');

  const partnerId = partner?.id;

  const reload = useCallback(async () => {
    if (!partnerId) return;
    setTouchpoints(await fetchTouchpoints(partnerId));
  }, [partnerId]);

  useEffect(() => {
    if (open && partnerId) {
      setMethod('email');
      setOccurredOn(new Date().toISOString().slice(0, 10));
      setSummary('');
      setConfirmArchive(false);
      void reload();
    }
  }, [open, partnerId, reload]);

  if (!partner) return null;

  const type = PARTNER_TYPE[partner.type];
  const status = stewardshipStatus(partner);
  const loggerName = (id: string | null) => (id ? profiles.find((p) => p.id === id)?.full_name ?? '—' : '—');
  const ownerProfiles = profiles.filter((p) => p.role === 'admin' || p.department === 'partnerships' || p.partnerships_access);

  const isDonor = partner.type === 'donor';
  const isCommunityOrChurch = partner.type === 'community' || partner.type === 'church';

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
    setSummary('');
    await reload();
    setBusy(false);
    onChanged(); // recompute due/overdue in the room + clear the spine task
  }

  // Soft delete — fetchPartners filters active=true, so the partner drops out of the
  // directory. The record (and its touchpoint history) is retained, not destroyed.
  async function archive() {
    if (!partner) return;
    setBusy(true);
    await updatePartner(partner.id, { active: false });
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
      {/* key on id: reset the uncontrolled (defaultValue) edit fields when the partner changes */}
      <div className="space-y-5" key={partner.id}>
        {/* Stewardship status banner */}
        <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${STEWARDSHIP[status].chip}`}>
          <span className="text-sm font-medium">{STEWARDSHIP[status].label}</span>
          <span className="text-xs">{dueLabel(partner)}</span>
        </div>

        {/* Log a touchpoint — the primary action */}
        <section className="rounded-xl border border-sparrow-rule p-3">
          <span className="field-label">Log a touchpoint</span>
          <div className="mt-1 flex gap-2">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as TouchpointMethod)}
              className="field-input mt-0 flex-1"
            >
              {TOUCHPOINT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {TOUCHPOINT_METHOD[m]}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
              className="field-input mt-0"
            />
          </div>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            placeholder="What happened? (optional)"
            className="field-input mt-2"
          />
          <button onClick={log} disabled={busy || !occurredOn} className="btn-primary mt-2 w-full">
            {busy ? 'Saving…' : 'Log touchpoint'}
          </button>
          <p className="mt-1.5 text-xs text-sparrow-gray">
            Resets the cadence clock and clears any "touchpoint due" task for the owner.
          </p>
        </section>

        {/* Stewardship fields */}
        <section className="grid grid-cols-2 gap-3">
          <Field label="Owner">
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
          </Field>
          <Field label="Stage">
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
          </Field>
          <Field label="Cadence (days)">
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
          </Field>
          {isDonor && (
            <Field label="Donor tier">
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
            </Field>
          )}
        </section>

        {/* Donor-only section */}
        {isDonor && (
          <section className="space-y-3 rounded-xl border border-sparrow-rule/70 p-3">
            <span className="field-label block">Donor details</span>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Giving method">
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
              </Field>
              <Field label="First gift date">
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
              </Field>
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

        {/* Community/Church-only section */}
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

        {/* Details — editable; each field saves on blur */}
        <section className="space-y-3">
          <EditField
            label="Name"
            value={partner.name}
            required
            disabled={busy}
            onSave={(v) => {
              if (v) void patch({ name: v });
            }}
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
          <Row label="Last touch" value={shortDate(partner.last_touchpoint_at)} />
        </section>

        {/* Notes */}
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

        {/* Touchpoint history */}
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

        {/* Archive (soft delete) */}
        <section className="border-t border-sparrow-rule pt-4">
          {confirmArchive ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-sparrow-ink">Archive {partner.name}?</span>
              <div className="flex shrink-0 gap-2">
                <button onClick={() => setConfirmArchive(false)} className="btn-ghost">
                  Cancel
                </button>
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
          )}
        </section>
      </div>
    </Drawer>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="field-label">{label}</span>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-20 shrink-0 text-xs uppercase tracking-wide text-sparrow-gray">{label}</span>
      <span className="min-w-0 flex-1 text-sparrow-ink">{value}</span>
    </div>
  );
}

/** Uncontrolled text field that saves on blur (only when changed). `required` reverts a
 *  blanked value rather than saving null — used for the not-null `name`. */
function EditField({
  label,
  value,
  onSave,
  type = 'text',
  placeholder,
  disabled,
  required,
  action,
}: {
  label: string;
  value: string;
  onSave: (v: string | null) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  action?: React.ReactNode;
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
          if (required && !trimmed) {
            e.target.value = value; // name can't be blank — revert
            return;
          }
          const next = trimmed || null;
          if (next !== (value || null)) onSave(next);
        }}
        className="field-input mt-0"
      />
    </div>
  );
}
