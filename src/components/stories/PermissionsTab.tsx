import { currentConsentFor, isClearedToPublish, type StoryLayer2Consent, type StoryParticipant } from '@/lib/stories';

// Central "check everyone at a glance" view -- Shelly's ask (inbound-message-
// triage-2026-10 Batch 1 item 4): a single place to scan every participant's
// photo/story permissions, active or past, rather than hunting through
// individual stories. Reuses data StoriesRoom already fetches (participants +
// consents) and the same currentConsentFor()/isClearedToPublish() helpers the
// rest of this room already relies on -- no new fetch, no new business logic.
// See also FamilyDetailPanel's Consent tab (migration 0184) for the per-family
// version of this same idea, which Shelly reaches for more often day-to-day;
// this table is the companion "everyone at once" view.

interface Props {
  participants: StoryParticipant[];
  consents: StoryLayer2Consent[];
}

function formatDate(d: string): string {
  const iso = d.includes('T') ? d : `${d}T12:00:00`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function namingCell(c: StoryLayer2Consent | null): string {
  if (!c) return '—';
  if (c.naming_choice) return c.naming_choice === 'named' ? 'Named' : 'Anonymous';
  if (c.photo_consent !== null) return '— (prior form)';
  return '—';
}

function faceCell(obscured: boolean | null | undefined, legacyConsent: boolean | null): string {
  if (obscured != null) return obscured ? 'Blurred' : 'Not blurred';
  if (legacyConsent !== null) return legacyConsent ? 'Consented (prior form)' : 'Declined (prior form)';
  return '—';
}

export function PermissionsTab({ participants, consents }: Props) {
  const sorted = [...participants].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.full_name.localeCompare(b.full_name);
  });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist/30 px-4 py-3 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
        Every participant's current Photo &amp; Media Release status, active and past, at a glance. This reflects
        whatever's most recently on file for her in the Photo &amp; Media Release tab — it doesn't live here
        separately, so there's nothing to keep in sync.
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No participants on file yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sparrow-green dark:bg-sparrow-dark-green">
                <th className="px-4 py-2 text-left font-semibold text-white/90">Participant</th>
                <th className="px-4 py-2 text-left font-semibold text-white/90">Status</th>
                <th className="px-4 py-2 text-left font-semibold text-white/90">Cleared to publish?</th>
                <th className="px-4 py-2 text-left font-semibold text-white/90">Named/Anonymous</th>
                <th className="px-4 py-2 text-left font-semibold text-white/90">Her face</th>
                <th className="px-4 py-2 text-left font-semibold text-white/90">Kids' faces</th>
                <th className="px-4 py-2 text-left font-semibold text-white/90">Date signed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sparrow-rule dark:divide-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface">
              {sorted.map((p) => {
                const current = currentConsentFor(consents, p.adult_id);
                const cleared = isClearedToPublish(consents, p.adult_id);
                return (
                  <tr key={p.adult_id}>
                    <td className="px-4 py-2.5 font-medium text-sparrow-ink dark:text-sparrow-dark-ink">
                      {p.full_name}{' '}
                      <span className="text-sparrow-gray dark:text-sparrow-dark-gray">({p.family_display_name})</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {p.active ? (
                        <span className="text-sparrow-gray dark:text-sparrow-dark-gray">Active</span>
                      ) : (
                        <span className="rounded-full bg-slate-100 dark:bg-slate-500/15 px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                          Past
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {cleared ? (
                        <span className="font-medium text-sparrow-green dark:text-sparrow-dark-green">✓ Cleared</span>
                      ) : (
                        <span className="font-medium text-priority-p1">⚠ Not cleared</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-sparrow-ink dark:text-sparrow-dark-ink">{namingCell(current)}</td>
                    <td className="px-4 py-2.5 text-sparrow-ink dark:text-sparrow-dark-ink">
                      {faceCell(current?.face_obscured, current?.photo_consent ?? null)}
                    </td>
                    <td className="px-4 py-2.5 text-sparrow-ink dark:text-sparrow-dark-ink">
                      {faceCell(
                        current?.children_face_obscured,
                        current?.children_photo_consent === 'n/a' || current?.children_photo_consent === undefined
                          ? null
                          : current.children_photo_consent === 'yes',
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-sparrow-gray dark:text-sparrow-dark-gray">
                      {current?.date_signed || current?.created_at ? formatDate(current.date_signed ?? current.created_at) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
