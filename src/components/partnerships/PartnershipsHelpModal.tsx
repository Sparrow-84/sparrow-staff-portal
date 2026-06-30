import {
  DONOR_TIER,
  DONOR_TIER_DESC,
  PARTNER_STAGE,
  PARTNER_STAGE_DESC,
  type DonorTier,
  type PartnerStage,
} from '@/lib/partnerships-types';

const STAGES: PartnerStage[] = ['prospect', 'active', 'reengaging', 'lapsed', 'inactive'];
const TIERS: DonorTier[] = ['first_time', 'recurring', 'major', 'lapsed'];

export function PartnershipsHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-sparrow-ink/40 px-4 py-12"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-sparrow-rule px-6 py-4">
          <h2 className="font-serif text-lg font-semibold">How this room works</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-xl leading-none text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">

          {/* ── Do I have a to-do right now? ── The most important section */}
          <section className="rounded-xl bg-sparrow-mist/60 px-4 py-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
              Do I have a to-do right now?
            </h3>

            <p className="mb-2 text-sm font-medium text-sparrow-ink">Yes — act when the dot is:</p>
            <div className="space-y-2 pl-1">
              <DotRow dot="bg-priority-p1" label="Overdue (red)" desc="Your cadence window passed without a logged touchpoint. A task has been added to your Incoming Tasks." />
              <DotRow dot="bg-slate-400" label="No cadence (gray)" desc="No stewardship rhythm is set. Open the record and add a cadence so the relationship is tracked." />
            </div>

            <p className="mb-2 mt-4 text-sm font-medium text-sparrow-ink">Not right now — when the dot is:</p>
            <div className="space-y-2 pl-1">
              <DotRow dot="bg-sparrow-green" label="On cadence (green)" desc="You're up to date. Nothing needed until the next cadence window opens." />
              <DotRow dot="bg-sparrow-gold" label="Due soon (gold)" desc="Touchpoint due within 7 days. Good time to plan ahead — not urgent yet." />
              <DotRow dot="bg-orange-500" label="Lapsed (orange)" desc="The relationship has gone cold — 12+ months since they engaged. If you've already sent the warm check-in, you're done. The record will prompt you when 60 days passes with no response." />
              <DotRow dot="bg-sparrow-rule" label="Inactive (light gray)" desc="Off your active list. No action needed. They still receive TSM unless they unsubscribe." />
            </div>

            <p className="mt-4 rounded-lg border border-sparrow-rule bg-white px-3 py-2 text-xs text-sparrow-gray">
              The colored dot system applies to <strong>all partner types</strong> — donors, churches, community partners, volunteers, everyone. Cadences are set per record, so different partners have different rhythms.
            </p>
          </section>

          <hr className="border-sparrow-rule" />

          {/* ── Relationship stages ── */}
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
              Relationship stages — all partner types
            </h3>
            <p className="mb-3 text-xs text-sparrow-gray">
              Stages describe where the relationship stands — not whether you have a task. You can have a lapsed partner who is <em>not</em> on your to-do list because you've already sent the check-in.
            </p>
            <div className="space-y-3">
              {STAGES.map((s) => (
                <div key={s}>
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${PARTNER_STAGE[s].chip}`}>
                    {PARTNER_STAGE[s].label}
                  </span>
                  <p className="mt-1 text-xs text-sparrow-gray">{PARTNER_STAGE_DESC[s]}</p>
                </div>
              ))}
            </div>
          </section>

          <hr className="border-sparrow-rule" />

          {/* ── Donor tiers ── */}
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
              Donor tiers — donors only
            </h3>
            <p className="mb-3 text-xs text-sparrow-gray">
              Only visible on donor records. Tracks <em>giving history</em> — separate from the relationship stage. A donor can be re-engaging in stage (reconnected relationally) while still lapsed in tier (hasn't given yet).
            </p>
            <div className="space-y-3">
              {TIERS.map((t) => (
                <div key={t}>
                  <p className="text-sm font-medium text-sparrow-ink">{DONOR_TIER[t]}</p>
                  <p className="mt-0.5 text-xs text-sparrow-gray">{DONOR_TIER_DESC[t]}</p>
                </div>
              ))}
            </div>
          </section>

          <hr className="border-sparrow-rule" />

          {/* ── Key rules ── */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
              Key rules
            </h3>
            <div className="space-y-4">
              <Rule
                title="What counts as meaningful engagement"
                body="A donation, an inbound email reply, a returned call, or an in-person meeting. Opening the newsletter alone does not count."
              />
              <Rule
                title="The 60-day rule (lapsed partners)"
                body="After sending a warm check-in and waiting 60 days with no response, mark them inactive. Their record opens a prompt when that threshold is reached — the default is one click."
              />
              <Rule
                title="Active list vs. newsletter list"
                body="Marking someone inactive drops them off your stewardship list — it does not remove them from TSM. They keep getting the newsletter unless they unsubscribe."
              />
              <Rule
                title="Re-engaging partners — donors only"
                body="Get the newsletter and event invites, but no donation asks or year-end giving appeals. Move them back to an active donor tier manually when they financially re-engage."
              />
              <Rule
                title="3 financial asks per year — donors only"
                body="April TSM (Easter), Giving Tuesday (November), December TSM (Christmas). All other communications are relational — no asks."
              />
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

function DotRow({ dot, label, desc }: { dot: string; label: string; desc: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      <p className="text-xs leading-relaxed text-sparrow-gray">
        <span className="font-medium text-sparrow-ink">{label}</span> — {desc}
      </p>
    </div>
  );
}

function Rule({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-sparrow-ink">{title}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-sparrow-gray">{body}</p>
    </div>
  );
}
