// Partnerships Room — "Home" view.
// Room-wide situational awareness: everything currently due or overdue across every
// recurring thing in the room, shown the same way to anyone with Partnerships access.
// This is NOT a personal to-do list — that's each owner's Incoming Tasks (routed via
// owner_id / emit_system_task, unrelated to this screen). Home is the shared "what does
// the room as a whole need this week" glance.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Profile } from '@/lib/types';
import { localDate } from '@/lib/date';
import { bucketFor, dueLabel } from '@/lib/tasks';
import { fetchHomeItems, type HomeItem, type HomeItemKind, type HomeNavTarget } from '@/lib/partnerships-home';
import {
  fetchNeedsReviewDonations,
  resolveDonationAsNewPartner,
  resolveDonationLink,
  fetchRecentUnsubscribes,
  dismissUnsubscribe,
  type NeedsReviewDonation,
  type RecentUnsubscribe,
} from '@/lib/partnerships';
import { WidgetCard } from '@/components/home/widgets';
import { supabase } from '@/lib/supabase';
import { fetchPrayerVolunteers, type PrayerVolunteer } from '@/lib/prayer';
import { CheckinDoneForm } from './Checkins';
import { PrayerVolunteerActions } from './PrayerVolunteerActions';
import { CollateralReviewedButton } from './CollateralReviewedButton';
import { ConnectionNextStep } from './ConnectionNextStep';
import { updateCommStatus, type PartnershipConnection } from '@/lib/partnerships-tabs';

const KIND_ICON: Record<HomeItemKind, string> = {
  touchpoint: '🤝',
  collateral: '📦',
  connection: '🔗',
  social_post: '📱',
  newsletter: '📰',
  reminder: '🔔',
};

interface Props {
  profiles: Profile[];
  onOpenPartner: (id: string) => void;
  onNavigateTab: (tab: HomeNavTarget) => void;
  /** Opens the Add to Directory form prefilled from a Meaningful Connection. */
  onAddConnectionToDirectory: (conn: PartnershipConnection) => void;
}

export function PartnershipsHomeTab({ profiles, onOpenPartner, onNavigateTab, onAddConnectionToDirectory }: Props) {
  const [items, setItems] = useState<HomeItem[]>([]);
  const [needsReview, setNeedsReview] = useState<NeedsReviewDonation[]>([]);
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);
  const [unsubscribes, setUnsubscribes] = useState<RecentUnsubscribe[]>([]);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [prayerVolunteers, setPrayerVolunteers] = useState<Map<string, PrayerVolunteer>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A button that didn't work says so, instead of just becoming clickable again.
  const [actionError, setActionError] = useState<string | null>(null);

  function showActionError(e: unknown) {
    setActionError(`That didn't save: ${e instanceof Error ? e.message : 'something went wrong'}. Try again, or refresh the page.`);
  }

  const loadUnsubscribes = useCallback(() => {
    fetchRecentUnsubscribes().then(setUnsubscribes).catch(() => undefined);
  }, []);

  async function dismiss(partnerId: string) {
    setDismissingId(partnerId);
    setActionError(null);
    try {
      await dismissUnsubscribe(partnerId);
      loadUnsubscribes();
    } catch (e) {
      showActionError(e);
    } finally {
      setDismissingId(null);
    }
  }

  const loadNeedsReview = useCallback(() => {
    fetchNeedsReviewDonations().then(setNeedsReview).catch(() => undefined);
  }, []);

  const reloadItems = useCallback(() => {
    fetchHomeItems().then(setItems).catch(() => undefined);
  }, []);

  // Prayer reminders carry the same Snooze / Move off prayer team buttons as the Prayer
  // Team tab, which need the volunteer's current roster row. Only fetched when one is showing.
  const hasPrayerItems = items.some((i) => i.prayerVolunteerId);
  const loadPrayerVolunteers = useCallback(() => {
    fetchPrayerVolunteers()
      .then((vols) => setPrayerVolunteers(new Map(vols.map((v) => [v.id, v]))))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (hasPrayerItems) loadPrayerVolunteers();
  }, [hasPrayerItems, loadPrayerVolunteers]);
  const onPrayerChanged = useCallback(() => {
    reloadItems();
    loadPrayerVolunteers();
  }, [reloadItems, loadPrayerVolunteers]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchHomeItems(), fetchNeedsReviewDonations(), fetchRecentUnsubscribes()])
      .then(([homeItems, review, recentUnsubs]) => {
        if (!cancelled) {
          setItems(homeItems);
          setNeedsReview(review);
          setUnsubscribes(recentUnsubs);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load Home.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function linkDonation(item: NeedsReviewDonation) {
    if (!item.donation.possible_match_partner_id) return;
    setReviewBusyId(item.donation.id);
    setActionError(null);
    try {
      await resolveDonationLink(item.donation.id, item.donation.possible_match_partner_id);
      loadNeedsReview();
    } catch (e) {
      showActionError(e);
    } finally {
      setReviewBusyId(null);
    }
  }

  async function confirmNewDonor(item: NeedsReviewDonation) {
    setReviewBusyId(item.donation.id);
    setActionError(null);
    try {
      const newPartnerId = await resolveDonationAsNewPartner(item.donation.id);
      loadNeedsReview();
      onOpenPartner(newPartnerId);
    } catch (e) {
      showActionError(e);
    } finally {
      setReviewBusyId(null);
    }
  }

  const today = localDate();
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const overdue = useMemo(
    () => items.filter((i) => bucketFor(i.due_date, false, today) === 'overdue'),
    [items, today],
  );
  const dueThisWeek = useMemo(
    () =>
      items.filter((i) => {
        const b = bucketFor(i.due_date, false, today);
        return b === 'today' || b === 'this_week';
      }),
    [items, today],
  );
  // Past this week: collateral reviews (two weeks ahead, 0211) and newsletter pieces (two weeks,
  // or 60 days for the Christmas TSM, Christmas cards and Annual Report, 0221).
  const comingUp = useMemo(
    () => items.filter((i) => bucketFor(i.due_date, false, today) === 'upcoming'),
    [items, today],
  );

  function ownerName(id: string): string {
    return profileById.get(id)?.full_name ?? 'Unassigned';
  }

  function open(item: HomeItem) {
    if (item.partnerId) {
      onOpenPartner(item.partnerId);
    } else if (item.navigateTab) {
      onNavigateTab(item.navigateTab);
    }
  }

  if (loading) return <p className="p-8 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading Home…</p>;
  if (error) return <p className="p-8 text-sm text-priority-p1">{error}</p>;

  return (
    <div className="space-y-6">
      <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
        Everything in the Partnerships room that needs attention: what's overdue, due this
        week or coming up, plus gifts to review and recent unsubscribes. Everyone with
        Partnerships access sees the same list.
      </p>
      {actionError && (
        <p className="rounded-xl border border-priority-p1/30 bg-priority-p1/5 px-4 py-2 text-sm text-priority-p1">{actionError}</p>
      )}

      {needsReview.length > 0 && (
        <WidgetCard title={`⚠️ Needs review (${needsReview.length})`}>
          <ul className="space-y-3">
            {needsReview.map(({ donation, candidateName }) => (
              <li key={donation.id} className="rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 p-3">
                <p className="text-sm text-amber-900 dark:text-amber-200">
                  A gift came in from <span className="font-medium">{donation.given_by_name ?? donation.given_by_email ?? 'an unknown donor'}</span>
                  {donation.amount_above_10k && (
                    <span className="ml-1.5 rounded-full bg-sparrow-gold/30 px-2 py-0.5 text-[10px] font-medium text-sparrow-ink dark:text-sparrow-dark-ink">$10k+</span>
                  )}
                  {' '}— possibly the same person as <span className="font-medium">{candidateName ?? 'an existing partner'}</span>.
                </p>
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                  Confirm before this becomes a new record — a duplicate can be merged later, but it's cleaner to catch it now.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => void linkDonation({ donation, candidateName })}
                    disabled={reviewBusyId === donation.id}
                    className="rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-900 disabled:opacity-50"
                  >
                    Link to {candidateName ?? 'existing partner'}
                  </button>
                  <button
                    onClick={() => void confirmNewDonor({ donation, candidateName })}
                    disabled={reviewBusyId === donation.id}
                    className="rounded-lg border border-amber-300 dark:border-amber-500/30 bg-white dark:bg-sparrow-dark-surface px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-300 transition hover:bg-amber-50 dark:hover:bg-amber-500/15 disabled:opacity-50"
                  >
                    No — new donor
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </WidgetCard>
      )}

      {unsubscribes.length > 0 && (
        <WidgetCard title={`📭 Recent unsubscribes (${unsubscribes.length})`}>
          <ul className="space-y-2">
            {unsubscribes.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm">
                <span className="min-w-0 truncate text-sparrow-ink dark:text-sparrow-dark-ink">
                  <span className="font-medium">{u.name}</span> unsubscribed from The Sparrow Monthly
                </span>
                <button
                  onClick={() => void dismiss(u.id)}
                  disabled={dismissingId === u.id}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray transition hover:bg-sparrow-mist/50 dark:hover:bg-sparrow-dark-surface2 hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink disabled:opacity-50"
                >
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-sparrow-gray dark:text-sparrow-dark-gray">
            Not a to-do — their "Subscribed to TSM" checkbox already updated on its own, and we leave them alone. Just so you know.
          </p>
        </WidgetCard>
      )}

      {items.length === 0 && needsReview.length === 0 ? (
        <div className="rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-8 text-center shadow-card">
          <p className="text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Nothing due or overdue this week. 🎉</p>
          <p className="mt-1 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
            Nothing in the room needs attention right now.
          </p>
        </div>
      ) : items.length === 0 ? null : (
        <>
          {overdue.length > 0 && (
            <WidgetCard title={`🔴 Overdue (${overdue.length})`}>
              <ItemsByOwner items={overdue} ownerName={ownerName} today={today} onOpen={open} onDone={reloadItems} prayerVolunteers={prayerVolunteers} onPrayerChanged={onPrayerChanged} onAddConnectionToDirectory={onAddConnectionToDirectory} />
            </WidgetCard>
          )}
          <WidgetCard title={`Due this week (${dueThisWeek.length})`}>
            {dueThisWeek.length === 0 ? (
              <p className="py-4 text-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
                Nothing else coming due this week.
              </p>
            ) : (
              <ItemsByOwner items={dueThisWeek} ownerName={ownerName} today={today} onOpen={open} onDone={reloadItems} prayerVolunteers={prayerVolunteers} onPrayerChanged={onPrayerChanged} onAddConnectionToDirectory={onAddConnectionToDirectory} />
            )}
          </WidgetCard>
          {comingUp.length > 0 && (
            <WidgetCard title={`Coming up (${comingUp.length})`}>
              <ItemsByOwner items={comingUp} ownerName={ownerName} today={today} onOpen={open} onDone={reloadItems} prayerVolunteers={prayerVolunteers} onPrayerChanged={onPrayerChanged} onAddConnectionToDirectory={onAddConnectionToDirectory} />
            </WidgetCard>
          )}
        </>
      )}
    </div>
  );
}

function ItemsByOwner({
  items,
  ownerName,
  today,
  onOpen,
  onDone,
  prayerVolunteers,
  onPrayerChanged,
  onAddConnectionToDirectory,
}: {
  items: HomeItem[];
  ownerName: (id: string) => string;
  today: string;
  onOpen: (item: HomeItem) => void;
  onDone: () => void;
  prayerVolunteers: Map<string, PrayerVolunteer>;
  onPrayerChanged: () => void;
  onAddConnectionToDirectory: (conn: PartnershipConnection) => void;
}) {
  const [doneKey, setDoneKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  // A reminder that isn't a check-in (prayer check-in, comms milestone...): Done closes that
  // one task. A comms milestone's task closing also marks the milestone done (0221).
  async function closeTask(item: HomeItem) {
    if (!item.taskRef) return;
    setBusyKey(item.key);
    setErrorKey(null);
    try {
      const { error } = await supabase.rpc('resolve_system_task', { p_system: 'crm', p_ref: item.taskRef });
      if (error) throw new Error(error.message);
      onDone();
    } catch {
      setErrorKey(item.key);
    } finally {
      setBusyKey(null);
    }
  }

  // A newsletter piece not started yet: Mark started sets it In progress, same as the comms tab.
  async function markStarted(item: HomeItem) {
    if (!item.comm) return;
    setBusyKey(item.key);
    setErrorKey(null);
    try {
      await updateCommStatus(item.comm.id, 'in_progress');
      onDone();
    } catch {
      setErrorKey(item.key);
    } finally {
      setBusyKey(null);
    }
  }

  const groups = useMemo(() => {
    const map = new Map<string, HomeItem[]>();
    for (const item of items) {
      const list = map.get(item.owner_id) ?? [];
      list.push(item);
      map.set(item.owner_id, list);
    }
    return Array.from(map.entries()).sort((a, b) => ownerName(a[0]).localeCompare(ownerName(b[0])));
  }, [items, ownerName]);

  return (
    <div className="space-y-4">
      {groups.map(([ownerId, ownerItems]) => (
        <div key={ownerId}>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">
            {ownerName(ownerId)} · {ownerItems.length}
          </p>
          <ul className="space-y-1">
            {ownerItems.map((item) => (
              <li key={item.key}>
                <div className="flex items-start gap-1">
                <button
                  onClick={() => onOpen(item)}
                  className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-sparrow-mist/50 dark:hover:bg-sparrow-dark-surface2"
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden>{KIND_ICON[item.kind]}</span>
                      <span className="truncate text-sparrow-ink dark:text-sparrow-dark-ink">{item.title}</span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        bucketFor(item.due_date, false, today) === 'overdue'
                          ? 'bg-priority-p1/15 text-priority-p1'
                          : 'bg-sparrow-gold/20 text-sparrow-ink dark:text-sparrow-dark-ink'
                      }`}
                    >
                      {dueLabel(item.due_date, today)}
                    </span>
                  </span>
                  {item.detail && (
                    <span className="pl-6 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{item.detail}</span>
                  )}
                </button>
                {(item.checkin || item.taskRef) && (
                  <button
                    onClick={() => (item.checkin ? setDoneKey(doneKey === item.key ? null : item.key) : void closeTask(item))}
                    disabled={busyKey === item.key}
                    className="mt-1 shrink-0 rounded-lg bg-sparrow-green dark:bg-sparrow-dark-green px-2.5 py-1 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    Done
                  </button>
                )}
                {item.collateral && (
                  <CollateralReviewedButton
                    itemId={item.collateral.id}
                    itemName={item.collateral.name}
                    onDone={onDone}
                    variant="button"
                  />
                )}
                {item.connection && (
                  <ConnectionNextStep
                    connection={item.connection}
                    onAddToDirectory={onAddConnectionToDirectory}
                    onDone={onDone}
                    variant="button"
                  />
                )}
                {item.comm && (
                  <button
                    onClick={() => void markStarted(item)}
                    disabled={busyKey === item.key}
                    className="mt-1 shrink-0 rounded-lg bg-sparrow-green dark:bg-sparrow-dark-green px-2.5 py-1 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    Mark started
                  </button>
                )}
                </div>
                {errorKey === item.key && (
                  <p className="pb-1 pl-8 text-xs text-priority-p1">That didn't save. Try again, or refresh the page.</p>
                )}
                {item.message && <ReminderMessage message={item.message} />}
                {item.prayerVolunteerId && prayerVolunteers.get(item.prayerVolunteerId)?.active && (
                  <div className="pb-1 pl-8">
                    <PrayerVolunteerActions
                      volunteer={prayerVolunteers.get(item.prayerVolunteerId)!}
                      onChanged={onPrayerChanged}
                    />
                  </div>
                )}
                {item.checkin && doneKey === item.key && (
                  <div className="pl-2">
                    <CheckinDoneForm
                      checkin={item.checkin}
                      onDone={() => { setDoneKey(null); onDone(); }}
                      onCancel={() => setDoneKey(null)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** A reminder's ready-to-send message, with a Copy button — so whoever is covering can send
 *  it straight from Home. */
function ReminderMessage({ message }: { message: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the text is still selectable by hand.
    }
  }

  return (
    <div className="mb-1 ml-8 mr-2 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist/40 dark:bg-sparrow-dark-surface2 px-3 py-2">
      <p className="select-text whitespace-pre-wrap text-xs text-sparrow-ink dark:text-sparrow-dark-ink">{message}</p>
      <button
        onClick={() => void copy()}
        className="mt-1.5 text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline"
      >
        {copied ? 'Copied ✓' : 'Copy message'}
      </button>
    </div>
  );
}
