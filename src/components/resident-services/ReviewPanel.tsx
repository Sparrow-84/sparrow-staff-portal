import { useEffect, useState } from 'react';
import { Drawer } from '../lcp/Drawer';
import type { Profile } from '@/lib/types';
import {
  archiveService,
  closeReviewWithoutServices,
  completeReview,
  type ResidentService,
  type ServiceReview,
} from '@/lib/resident-services';
import { StillCorrectButton } from './Freshness';
import { OrgContacts } from '../partnerships/OrgContacts';

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2 text-sm">
      <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{label}</span>
      <span className={value ? 'select-text whitespace-pre-line text-sparrow-ink dark:text-sparrow-dark-ink' : 'text-sparrow-gray/60 dark:text-sparrow-dark-gray/60'}>{value || '—'}</span>
    </div>
  );
}

/** One organization sent over from the Directory. The reviewer reads what Partnerships
 *  already has, adds the programs residents can use (saved as waiting for review), then
 *  confirms -- which is the moment they become "checked" and join the main list. */
export function ReviewPanel({
  open,
  review,
  pendingServices,
  profiles,
  currentUserId,
  onClose,
  onAddService,
  onEditService,
  onChanged,
}: {
  open: boolean;
  review: ServiceReview | null;
  pendingServices: ResidentService[];
  profiles: Profile[];
  currentUserId: string;
  onClose: () => void;
  onAddService: () => void;
  onEditService: (s: ResidentService) => void;
  onChanged: () => void;
}) {
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setConfirmClose(false);
    setError(null);
  }, [open, review?.id]);

  if (!review) return null;
  const partner = review.partner;
  const sender = review.sent_by ? profiles.find((p) => p.id === review.sent_by)?.full_name ?? null : null;

  async function run(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong saving that.');
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={partner?.name ?? 'Organization'}
      subtitle={`To review · sent ${shortDate(review.sent_at)}${sender ? ` by ${sender}` : ''}`}
      footer={
        <div className="space-y-2">
          {error && <p className="text-sm text-priority-p1">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <StillCorrectButton
              primary
              label="Reviewed — this is correct"
              disabled={pendingServices.length === 0}
              onConfirm={(how) => run(async () => { await completeReview(review.id, how); onClose(); })}
            />
          </div>
          <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
            {pendingServices.length === 0
              ? 'Add at least one program first. If there\'s nothing here for residents, close it below.'
              : `Marks ${pendingServices.length === 1 ? 'this program' : `these ${pendingServices.length} programs`} checked today by you and adds ${pendingServices.length === 1 ? 'it' : 'them'} to the main list.`}
          </p>
        </div>
      }
    >
      <div className="space-y-5">
        <p className="rounded-xl bg-amber-50 dark:bg-amber-500/10 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200">
          Partnerships sent this over from the Directory. Read what we have below, check it with them, add the programs residents can use, then click <strong>Reviewed — this is correct</strong>.
        </p>

        {/* Programs being added */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="field-label">Programs and services</span>
            <button onClick={onAddService} className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline">
              + Add a program or service
            </button>
          </div>
          {pendingServices.length === 0 ? (
            <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
              None yet. One organization can offer several, so add each program separately.
            </p>
          ) : (
            <div className="space-y-2">
              {pendingServices.map((s) => (
                <div key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-sparrow-rule/70 dark:border-sparrow-dark-border px-3 py-2.5">
                  <div>
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className="block text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                      {s.service_type} · {s.serves.join(' · ')}{s.help_phone ? ` · ${s.help_phone}` : ''}
                    </span>
                  </div>
                  <span className="flex gap-3">
                    <button onClick={() => onEditService(s)} className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline">
                      Edit
                    </button>
                    <button onClick={() => void run(() => archiveService(s.id))} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-priority-p1">
                      Remove
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Everything Partnerships already has */}
        {partner && (
          <section className="space-y-3 rounded-xl bg-sparrow-green/5 dark:bg-sparrow-dark-surface2 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-green dark:text-sparrow-dark-green">What we already have · from the Directory</p>
            <Row label="Where it came from" value={partner.source} />
            <Row label="Phone" value={partner.phone} />
            <Row label="Email" value={partner.email} />
            <Row label="Address" value={partner.address} />
            <Row label="Website" value={partner.website} />
            <OrgContacts partnerId={partner.id} onChanged={onChanged} />
            <div className="space-y-1">
              <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Notes</span>
              <p className={partner.notes
                ? 'select-text whitespace-pre-line rounded-lg bg-white dark:bg-sparrow-dark-surface px-3 py-2 text-sm'
                : 'text-sm text-sparrow-gray/60 dark:text-sparrow-dark-gray/60'}
              >
                {partner.notes || '—'}
              </p>
            </div>
            <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
              Phone numbers here may be an office line, not the number residents call. Put the number residents should call on each program.
            </p>
          </section>
        )}

        <section className="border-t border-sparrow-rule dark:border-sparrow-dark-border pt-4">
          {confirmClose ? (
            <div className="space-y-2">
              <p className="text-sm">Close this without adding anything? It stays in the Directory; it just won't be in Resident Services.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmClose(false)} className="btn-ghost">Cancel</button>
                <button
                  onClick={() => void run(async () => { await closeReviewWithoutServices(review.id, currentUserId); onClose(); })}
                  className="btn-secondary"
                >
                  Close it
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClose(true)}
              disabled={pendingServices.length > 0}
              title={pendingServices.length > 0 ? 'Remove the programs you added first' : undefined}
              className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink disabled:opacity-50"
            >
              Nothing here for residents → close without adding
            </button>
          )}
        </section>
      </div>
    </Drawer>
  );
}
