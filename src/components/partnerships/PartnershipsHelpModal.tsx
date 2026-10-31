import {
  DONOR_TIER,
  DONOR_TIER_DESC,
  PARTNER_STAGE,
  PARTNER_STAGE_DESC,
  type DonorTier,
  type PartnerStage,
} from '@/lib/partnerships-types';

const STAGES: PartnerStage[] = ['prospect', 'active', 'inactive'];
const TIERS: DonorTier[] = ['first_time', 'recurring', 'major', 'lapsed'];

export function PartnershipsHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-sparrow-ink/40 px-4 py-12"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-sparrow-dark-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-sparrow-rule dark:border-sparrow-dark-border px-6 py-4">
          <h2 className="font-serif text-lg font-semibold">How this room works</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-xl leading-none text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">

          <p className="text-xs leading-relaxed text-sparrow-gray dark:text-sparrow-dark-gray">
            A <strong>touchpoint</strong> is a personal, 1:1 interaction — a call, a personal
            email, a text, a letter, a meeting, or a visit. For most relationships, no separate
            touchpoint is expected at all: TSM subscription plus any fixed thank-you moments is
            the complete plan. Community Partners are the exception — they need specific, named,
            dated check-ins, since the relationship is ongoing and practical rather than built
            around a single gift or signup.
          </p>

          {/* ── Do I have a to-do right now? ── The most important section */}
          <section className="rounded-xl bg-sparrow-mist/60 dark:bg-sparrow-dark-surface2 px-4 py-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">
              Do I have a to-do right now?
            </h3>

            <p className="mb-2 text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Yes — when the dot is:</p>
            <div className="space-y-2 pl-1">
              <DotRow dot="bg-priority-p1" label="Red — needs attention" desc="An overdue named touchpoint, or an unacknowledged Brevo-unsubscribe notice. Worth a look." />
            </div>

            <p className="mb-2 mt-4 text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Not right now:</p>
            <div className="space-y-2 pl-1">
              <DotRow dot="bg-sparrow-green" label="Green — all good" desc="Covered — either nothing additional is needed beyond TSM, or the named touchpoint isn't due yet." />
              <DotRow dot="bg-sparrow-rule dark:bg-sparrow-dark-border" label="No dot — inactive" desc="Off the active list entirely. No action needed. They still receive TSM unless they unsubscribe." />
            </div>

            <p className="mt-4 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface px-3 py-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
              Most Donor and Volunteer records never show anything to track — that's by design,
              not a gap. "Needs additional touchpoint" is for the relationships that genuinely
              need a specific, dated item, mainly Community Partners.
            </p>
          </section>

          <hr className="border-sparrow-rule dark:border-sparrow-dark-border" />

          {/* ── Relationship stages ── */}
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">
              Relationship stages
            </h3>
            <div className="space-y-3">
              {STAGES.map((s) => (
                <div key={s}>
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${PARTNER_STAGE[s].chip}`}>
                    {PARTNER_STAGE[s].label}
                  </span>
                  <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{PARTNER_STAGE_DESC[s]}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface px-3 py-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
              A separate "lapsed" flag (12+ months with no contact) applies to Community Partner
              and Volunteer records, not Donor — a donor who gave once and went quiet may simply
              have been a one-time donor, not a stalled relationship. It's not a stage you set;
              it's calculated automatically.
            </p>
          </section>

          <hr className="border-sparrow-rule dark:border-sparrow-dark-border" />

          {/* ── Donor tiers ── */}
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">
              Donor tiers — donors only
            </h3>
            <p className="mb-3 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
              Only visible on donor records. Tracks <em>giving history</em> — separate from the relationship stage.
            </p>
            <div className="space-y-3">
              {TIERS.map((t) => (
                <div key={t}>
                  <p className="text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{DONOR_TIER[t]}</p>
                  <p className="mt-0.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{DONOR_TIER_DESC[t]}</p>
                </div>
              ))}
            </div>
          </section>

          <hr className="border-sparrow-rule dark:border-sparrow-dark-border" />

          {/* ── Key rules ── */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">
              Key rules
            </h3>
            <div className="space-y-4">
              <Rule
                title="Brevo unsubscribes surface automatically"
                body={'When someone unsubscribes from TSM, their "Subscribed to TSM" checkbox updates on its own and a dismissible FYI notice appears on Partnerships Home — not a to-do, just a chance to consider whether anything about their touchpoint plan should change.'}
              />
              <Rule
                title="Active list vs. newsletter list"
                body="Marking someone inactive drops them off the active stewardship list — it does not remove them from TSM. They keep getting the newsletter unless they unsubscribe."
              />
              <Rule
                title="Financial asks are counted, not capped — donors only"
                body="The number of asks going out each year is tracked so the relationship stays mindful, not to enforce a hard limit — the count can change year to year."
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
      <p className="text-xs leading-relaxed text-sparrow-gray dark:text-sparrow-dark-gray">
        <span className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{label}</span> — {desc}
      </p>
    </div>
  );
}

function Rule({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{title}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-sparrow-gray dark:text-sparrow-dark-gray">{body}</p>
    </div>
  );
}
