// Partnerships Room — "Home" rollup data.
// Room-wide situational awareness: everything currently due or coming due this week
// across every recurring thing in the room (touchpoints, collateral reviews, connection
// follow-ups, the social posting rhythm, the newsletter/comms calendar). This mirrors the
// due-logic in supabase/migrations/0080_partnerships_reminder_engine.sql's emit_* functions
// (kept in sync by hand — see the comment above fetchHomeItems for why this isn't sourced
// from the `tasks` table directly), but is a *client-side derivation for display only* —
// it doesn't create or resolve any tasks. The reminder engine's cron job is what actually
// pushes work onto each owner's Incoming Tasks; this screen just gives the room a shared
// look at the same rhythm.
import { supabase } from './supabase';
import { localDate } from './date';
import { bucketFor } from './tasks';
import { attachCheckins, fetchOpenCheckins, fetchPartnershipsRoomAdminId } from './partnerships';
import {
  COLLATERAL_HEADS_UP_DAYS, SOCIAL_RHYTHM_DAYS, connectionNeedsNextStep, newsletterReminderDue, toCollateral,
  type CommStatus, type CommType,
  type PartnershipConnection,
} from './partnerships-tabs';

export type HomeItemKind = 'touchpoint' | 'collateral' | 'connection' | 'social_post' | 'newsletter' | 'reminder';

/** Which existing Partnerships tab a "view" click on this item should jump to. */
export type HomeNavTarget = 'collateral' | 'events' | 'social' | 'comms' | 'prayer';

export interface HomeItem {
  key: string;
  kind: HomeItemKind;
  title: string;
  /** Optional second line. */
  detail?: string;
  due_date: string; // YYYY-MM-DD
  owner_id: string;
  /** Set on touchpoint items — lets the caller open that partner's detail panel directly. */
  partnerId?: string;
  /** Set on every other kind — lets the caller switch to the tab that manages this item. */
  navigateTab?: HomeNavTarget;
  /** Set on a check-in: Done closes just this one and asks when the next is due. */
  checkin?: { id: string; label: string; legacy?: boolean };
  /** Set on a 'reminder' (any other open Partnerships task): Done closes that task. */
  taskRef?: string;
  /** Set on a prayer check-in reminder: the roster volunteer it's about, so Home can offer
   *  the same Snooze / Move off prayer team buttons as the Prayer Team tab. */
  prayerVolunteerId?: string;
  /** A reminder's pre-written, ready-to-send message (prayer check-ins), shown with a Copy
   *  button. Empty until migration 0210 runs. */
  message?: string;
  /** Set on a collateral review: Home offers the same Mark reviewed button as the tab. */
  collateral?: { id: string; name: string };
  /** Set on a connection follow-up: Home offers the same Done / Choose next step as the tab. */
  connection?: PartnershipConnection;
  /** Set on a newsletter piece not started yet: Home offers Mark started (sets In progress). */
  comm?: { id: string };
}

/** Open Partnerships task kinds Home already lists from their own source rows (or, for
 *  possible duplicate donors, in the Needs review card) -- skipped so nothing shows twice. */
const DERIVED_TASK_PREFIXES = new Set([
  'touchpoint', 'checkin', 'collateral_review', 'connection_followup', 'social_post', 'comms', 'possible_duplicate_donor',
]);

/** Where a click on an open-task reminder goes, by its source_ref prefix. */
function reminderTarget(ref: string): Pick<HomeItem, 'partnerId' | 'navigateTab' | 'prayerVolunteerId'> {
  const [prefix, id] = ref.split(':');
  if (prefix === 'prayer_miss' || prefix === 'prayer_snooze_check') return { navigateTab: 'prayer', prayerVolunteerId: id };
  if (prefix === 'comms_milestone') return { navigateTab: 'comms' };
  return {};
}

const DAY_MS = 86_400_000;

/** First 10 chars of a date or timestamptz string — the YYYY-MM-DD part. */
function dateOnly(v: string): string {
  return v.length >= 10 ? v.slice(0, 10) : v;
}

/** Add N days to a YYYY-MM-DD date, returning YYYY-MM-DD. */
function addDays(iso: string, days: number): string {
  const d = new Date(`${dateOnly(iso)}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(`${toIso}T00:00:00`).getTime() - new Date(`${fromIso}T00:00:00`).getTime()) / DAY_MS);
}

/** True when the given due date is overdue or falls within the next 7 days (today included). */
function inScope(dueDate: string, today: string): boolean {
  const bucket = bucketFor(dueDate, false, today);
  return bucket === 'overdue' || bucket === 'today' || bucket === 'this_week';
}

interface PartnerRow {
  id: string;
  name: string;
  owner_id: string | null;
  active: boolean;
  stage: string;
  needs_additional_touchpoint: boolean;
  additional_touchpoint_label: string | null;
  additional_touchpoint_due: string | null;
}

interface OpenReminderRow {
  id: string;
  title: string;
  due_date: string | null;
  source_ref: string;
  assignee_id: string | null;
}

interface CollateralRow {
  id: string;
  item_name: string;
  owner_id: string;
  active: boolean;
  last_reviewed_at: string;
  /** Migration 0211; derived from cadence_days until it runs. */
  next_review_at?: string | null;
  cadence_days?: number | null;
}

type ConnectionRow = PartnershipConnection;

interface EventRow {
  id: string;
  event_name: string;
}

interface RecurringSettingRow {
  kind: 'social_post' | 'newsletter';
  cadence_days: number;
  lead_time_days: number;
  owner_id: string;
}

interface SocialPostRow {
  planned_date: string | null;
  status: 'planned' | 'scheduled' | 'posted';
}

interface CommRow {
  id: string;
  title: string;
  publish_date: string;
  status: CommStatus;
  comm_type: CommType;
}

/**
 * Room-wide rollup for the Partnerships Home view.
 *
 * Why this re-derives due-logic client-side instead of reading it off the `tasks` table
 * (which is what emit_system_task() ultimately writes to, and what each item's owner sees
 * in their own Incoming Tasks): tasks' RLS policy (0001_init.sql) only allows a signed-in
 * user to see tasks where they are the assignee, the creator, a manager of the assignee, or
 * an admin. Room-emitted tasks have no creator (created_by is null), so a non-admin,
 * non-manager Partnerships staffer would only ever see their OWN emitted tasks there — not
 * a room-wide view. That fails the locked requirement that everyone with Partnerships
 * access sees the same thing. The source tables this function reads instead (partners,
 * partnership_collateral, partnership_connections, partnership_recurring_settings,
 * partnership_social_posts, partnership_comms) are all already gated by
 * partnerships_has_access() for SELECT — the same room-wide reach the rest of this room's
 * tabs already rely on — so deriving here keeps the promise: same screen, same data, for
 * anyone who can open this room.
 */
export async function fetchHomeItems(): Promise<HomeItem[]> {
  const [
    partnersRes,
    collateralRes,
    connectionsRes,
    eventsRes,
    settingsRes,
    socialRes,
    commsRes,
    checkins,
    remindersRes,
  ] = await Promise.all([
    supabase
      .from('partners')
      .select('id, name, owner_id, active, stage, needs_additional_touchpoint, additional_touchpoint_label, additional_touchpoint_due')
      .eq('active', true),
    supabase
      .from('partnership_collateral')
      // '*' so this still works before migration 0211 adds next_review_at.
      .select('*')
      .eq('active', true),
    supabase
      .from('partnership_connections')
      .select('*')
      .is('archived_at', null),
    supabase.from('partnership_events').select('id, event_name'),
    supabase.from('partnership_recurring_settings').select('kind, cadence_days, lead_time_days, owner_id'),
    supabase.from('partnership_social_posts').select('planned_date, status'),
    supabase.from('partnership_comms').select('id, title, publish_date, status, comm_type').eq('status', 'not_started'),
    fetchOpenCheckins(),
    // Every other open Partnerships reminder (migration 0209); empty until it runs.
    supabase.rpc('partnerships_open_reminders'),
  ]);
  // Their pre-written messages (migration 0210); none until it runs.
  const messagesRes = await supabase.rpc('partnerships_open_reminder_messages');
  const messageByRef = new Map(
    messagesRes.error ? [] : ((messagesRes.data ?? []) as { source_ref: string; notes: string }[]).map((m) => [m.source_ref, m.notes]),
  );
  // A check-in on a record with no owner goes to the room admin, same as its task (0209).
  const roomAdminId = await fetchPartnershipsRoomAdminId();

  for (const res of [partnersRes, collateralRes, connectionsRes, eventsRes, settingsRes, socialRes, commsRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const partners = attachCheckins((partnersRes.data ?? []) as PartnerRow[], checkins);
  const reminders = remindersRes.error ? [] : ((remindersRes.data ?? []) as OpenReminderRow[]);
  const collateral = (collateralRes.data ?? []) as CollateralRow[];
  const connections = (connectionsRes.data ?? []) as ConnectionRow[];
  const events = (eventsRes.data ?? []) as EventRow[];
  const settings = (settingsRes.data ?? []) as RecurringSettingRow[];
  const socialPosts = (socialRes.data ?? []) as SocialPostRow[];
  const comms = (commsRes.data ?? []) as CommRow[];

  const today = localDate();
  const items: HomeItem[] = [];

  // 1. Check-ins coming due — mirrors emit_due_touchpoint_tasks() (migration 0209). Most
  // relationships need nothing here at all (TSM + fixed thank-yous cover them); this only
  // fires for named, dated check-ins someone added to a record — mainly Community Partners.
  // Each check-in is its own item, so a record with two shows twice.
  for (const p of partners) {
    const ownerId = p.owner_id ?? roomAdminId;
    if (!ownerId) continue;
    for (const c of p.checkins) {
      if (!c.due_date || !inScope(c.due_date, today)) continue;
      items.push({
        key: `checkin:${c.id}`,
        kind: 'touchpoint',
        title: `${p.name} needs ${c.label}`,
        due_date: c.due_date,
        owner_id: ownerId,
        partnerId: p.id,
        checkin: { id: c.id, label: c.label, legacy: c.legacy },
      });
    }
  }

  // 2. Collateral needing review — mirrors emit_collateral_review_tasks() (0211): shows two
  // weeks before its Next review date, not just this week.
  const collateralCutoff = addDays(today, COLLATERAL_HEADS_UP_DAYS);
  for (const c of collateral) {
    if (!c.owner_id || !c.last_reviewed_at) continue;
    const due = toCollateral(c).next_review_at;
    if (due > collateralCutoff) continue;
    items.push({
      key: `collateral:${c.id}`,
      kind: 'collateral',
      title: `Review collateral — ${c.item_name}`,
      due_date: due,
      owner_id: c.owner_id,
      navigateTab: 'collateral',
      collateral: { id: c.id, name: c.item_name },
    });
  }

  // 3. Connection follow-ups due — mirrors emit_overdue_connection_followups().
  const eventNameById = new Map(events.map((e) => [e.id, e.event_name]));
  // A week ahead (0215); no owner = the room admin. A connection with no next step (its
  // follow-up is done, or it never had a date) shows as due today until someone picks one.
  for (const c of connections) {
    const ownerId = c.owner_id ?? roomAdminId;
    if (!ownerId) continue;
    const eventName = c.event_id ? eventNameById.get(c.event_id) : undefined;
    const from = eventName ? ` — from ${eventName}` : '';
    if (connectionNeedsNextStep(c)) {
      items.push({
        key: `connection:${c.id}`,
        kind: 'connection',
        title: `Choose a next step for ${c.name}${from}`,
        detail: c.followup_done ? 'Followed up. Set another follow-up, add to the Directory, or archive.' : 'No follow-up set.',
        due_date: today,
        owner_id: ownerId,
        navigateTab: 'events',
        connection: c,
      });
      continue;
    }
    if (!c.followup_due || !inScope(c.followup_due, today)) continue;
    items.push({
      key: `connection:${c.id}`,
      kind: 'connection',
      title: `Follow up with ${c.name}${from}`,
      detail: c.next_action ?? undefined,
      due_date: c.followup_due,
      owner_id: ownerId,
      navigateTab: 'events',
      connection: c,
    });
  }

  // 4. Social posting reminder — mirrors emit_social_post_reminder() (0212): nags only when
  // nothing has been posted in two weeks. Planned posts don't count.
  const socialCfg = settings.find((s) => s.kind === 'social_post');
  if (socialCfg) {
    const posted = socialPosts.filter((s) => s.status === 'posted' && s.planned_date && s.planned_date <= today);
    const lastPosted = posted.length
      ? posted.map((s) => s.planned_date as string).sort().at(-1)!
      : null;
    const daysSinceLast = lastPosted ? daysBetween(lastPosted, today) : Infinity;
    if (daysSinceLast > SOCIAL_RHYTHM_DAYS) {
      items.push({
        key: 'social_post:reminder',
        kind: 'social_post',
        title: 'Social post needed — nothing posted in two weeks',
        due_date: today,
        owner_id: socialCfg.owner_id,
        navigateTab: 'social',
      });
    }
  }

  // 5. Pieces not started yet — mirrors emit_newsletter_reminder_tasks() (0221): two weeks
  // before the publish date, or 60 days for the pieces that need writers lined up early.
  const newsletterCfg = settings.find((s) => s.kind === 'newsletter');
  if (newsletterCfg) {
    for (const c of comms) {
      if (!newsletterReminderDue(c, today)) continue;
      items.push({
        key: `comms:${c.id}`,
        kind: 'newsletter',
        title: `Start ${c.title}`,
        detail: 'Not started yet. Mark started once the piece is underway.',
        due_date: c.publish_date,
        owner_id: newsletterCfg.owner_id,
        navigateTab: 'comms',
        comm: { id: c.id },
      });
    }
  }

  // 6. Every other open Partnerships reminder (prayer check-ins, comms milestones, donor
  // follow-ups...), straight from the task list. One with no due date counts as due today.
  for (const r of reminders) {
    if (DERIVED_TASK_PREFIXES.has(r.source_ref.split(':')[0])) continue;
    const due = r.due_date ? dateOnly(r.due_date) : today;
    if (!inScope(due, today)) continue;
    items.push({
      key: `task:${r.id}`,
      kind: 'reminder',
      title: r.title,
      due_date: due,
      owner_id: r.assignee_id ?? roomAdminId ?? '',
      taskRef: r.source_ref,
      message: messageByRef.get(r.source_ref),
      ...reminderTarget(r.source_ref),
    });
  }

  return items.sort((a, b) => a.due_date.localeCompare(b.due_date));
}
