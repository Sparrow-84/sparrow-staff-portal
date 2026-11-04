import type { Profile } from '@/lib/types';
import { LabelPill } from '@/components/LabelPill';
import type { PartnershipInterest } from '@/lib/partnership-interests';
import {
  PARTNER_STAGE,
  PARTNER_TYPE,
  STEWARDSHIP,
  derivedDonorTier,
  displayPartnerName,
  dueLabel,
  hasPartnershipTerms,
  shortDate,
  stewardshipStatus,
  type DonorStat,
  type Partner,
} from '@/lib/partnerships-types';

export function PartnerTileView({
  partners,
  profiles,
  onOpenPartner,
  donorStatMap = new Map(),
  interestMap = new Map(),
}: {
  partners: Partner[];
  profiles: Profile[];
  onOpenPartner: (id: string) => void;
  donorStatMap?: Map<string, DonorStat>;
  interestMap?: Map<string, PartnershipInterest[]>;
}) {
  function ownerName(id: string | null) {
    return id ? (profiles.find((p) => p.id === id)?.full_name ?? 'Unassigned') : 'Unassigned';
  }

  if (partners.length === 0) {
    return <p className="py-8 text-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No partners in this view yet.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {partners.map((p) => {
        const status = stewardshipStatus(p);
        const st = STEWARDSHIP[status];
        const type = PARTNER_TYPE[p.type];
        const stat = donorStatMap.get(p.id);
        const tier = derivedDonorTier(p.donor_tier, stat);
        // MOU status only applies to community/church/LCP referral partners.
        const mouNeeded = hasPartnershipTerms(p) && p.mou_status === 'needed';
        return (
          <button
            key={p.id}
            onClick={() => onOpenPartner(p.id)}
            className="relative rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4 text-left shadow-card transition hover:border-sparrow-green/40"
          >
            {/* Stewardship status dot */}
            <span
              className={`absolute right-4 top-4 h-2.5 w-2.5 rounded-full ${st.dot}`}
              title={st.label}
            />

            <p className="pr-8 font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">{displayPartnerName(p)}</p>
            <div className="mt-1 flex flex-col gap-0.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
              {/* Filters out any secondary_types value from before the taxonomy rebuild
                  (migration 0193) that no longer has an entry here -- PARTNER_TYPE[t] would
                  be undefined for a retired value like the old 'prayer' category and crash
                  this whole view otherwise. */}
              {[type, ...p.secondary_types.map((t) => PARTNER_TYPE[t]).filter(Boolean)].map((t) => (
                <span key={t.label}>{t.icon} {t.label}</span>
              ))}
            </div>
            <p className="mt-0.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{ownerName(p.owner_id)}</p>

            {(interestMap.get(p.id) ?? []).length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {(interestMap.get(p.id) ?? []).map((i) => (
                  <LabelPill key={i.id} label={i.label} color={i.color} />
                ))}
              </div>
            )}

            {dueLabel(p, new Date()) && (
              <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${st.chip}`}>
                {dueLabel(p, new Date())}
              </span>
            )}

            {/* Donation summary for donors */}
            {p.type === 'donor' && (
              <p className="mt-1 text-[10px] text-sparrow-gray dark:text-sparrow-dark-gray">
                {stat && stat.gift_count > 0
                  ? `${stat.gift_count} gift${stat.gift_count > 1 ? 's' : ''} · last ${shortDate(stat.last_gift_date)}`
                  : 'No gifts on record'}
              </p>
            )}

            {/* Stage + donor tier + MOU badges — MOU applies to community/church only */}
            {(p.stage === 'prospect' || tier === 'major' || (p.type === 'donor' && (tier === 'lapsed' || tier === 'first_time')) || mouNeeded) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.stage === 'prospect' && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${PARTNER_STAGE['prospect'].chip}`}>
                    Prospect
                  </span>
                )}
                {tier === 'major' && (
                  <span className="rounded-full bg-sparrow-gold/20 px-2 py-0.5 text-[10px] font-medium text-sparrow-ink dark:text-sparrow-dark-ink">
                    Major donor
                  </span>
                )}
                {tier === 'lapsed' && p.type === 'donor' && (
                  <span className="rounded-full bg-orange-100 dark:bg-orange-500/15 px-2 py-0.5 text-[10px] font-medium text-orange-700 dark:text-orange-300">
                    Lapsed giving
                  </span>
                )}
                {tier === 'first_time' && p.type === 'donor' && (
                  <span className="rounded-full bg-priority-p3/15 px-2 py-0.5 text-[10px] font-medium text-priority-p3">
                    First gift
                  </span>
                )}
                {mouNeeded && (
                  <span className="rounded-full bg-priority-p1/15 px-2 py-0.5 text-[10px] font-medium text-priority-p1">
                    MOU needed
                  </span>
                )}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
