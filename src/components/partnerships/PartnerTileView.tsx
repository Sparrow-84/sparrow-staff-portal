import type { Profile } from '@/lib/types';
import {
  PARTNER_STAGE,
  PARTNER_TYPE,
  STEWARDSHIP,
  dueLabel,
  stewardshipStatus,
  type Partner,
} from '@/lib/partnerships-types';

export function PartnerTileView({
  partners,
  profiles,
  onOpenPartner,
  nextCommLabel,
}: {
  partners: Partner[];
  profiles: Profile[];
  onOpenPartner: (id: string) => void;
  nextCommLabel?: string;
}) {
  function ownerName(id: string | null) {
    return id ? (profiles.find((p) => p.id === id)?.full_name ?? 'Unassigned') : 'Unassigned';
  }

  if (partners.length === 0) {
    return <p className="py-8 text-center text-sm text-sparrow-gray">No partners in this view yet.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {partners.map((p) => {
        const status = stewardshipStatus(p);
        const st = STEWARDSHIP[status];
        const type = PARTNER_TYPE[p.type];
        return (
          <button
            key={p.id}
            onClick={() => onOpenPartner(p.id)}
            className="relative rounded-2xl border border-sparrow-rule bg-white p-4 text-left shadow-card transition hover:border-sparrow-green/40"
          >
            {/* Stewardship status dot */}
            <span
              className={`absolute right-4 top-4 h-2.5 w-2.5 rounded-full ${st.dot}`}
              title={st.label}
            />

            <p className="pr-8 font-semibold text-sparrow-ink">{p.name}</p>
            <p className="mt-1 text-xs text-sparrow-gray">
              {type.icon} {type.label}
            </p>
            <p className="mt-0.5 text-xs text-sparrow-gray">{ownerName(p.owner_id)}</p>

            <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${st.chip}`}>
              {dueLabel(p, new Date(), p.cadence_days == null ? nextCommLabel : undefined)}
            </span>

            {/* Stage + donor + MOU badges */}
            {(p.stage === 'prospect' || p.stage === 'lapsed' || p.donor_tier === 'major' || p.mou_status === 'needed') && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(p.stage === 'prospect' || p.stage === 'lapsed') && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${PARTNER_STAGE[p.stage].chip}`}>
                    {PARTNER_STAGE[p.stage].label}
                  </span>
                )}
                {p.donor_tier === 'major' && (
                  <span className="rounded-full bg-sparrow-gold/20 px-2 py-0.5 text-[10px] font-medium text-sparrow-ink">
                    Major donor
                  </span>
                )}
                {p.mou_status === 'needed' && (
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
