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

export type HomeItemKind = 'touchpoint' | 'collateral' | 'connection' | 'social_post' | 'newsletter';

/** Which existing Partnerships tab a "view" click on this item should jump to. */
export type HomeNavTarget = 'collateral' | 'events' | 'social' | 'comms';

export interface HomeItem {
  key: string;
  kind: HomeItemKind;
  title: string;
  due_date: string; // YYYY-MM-DD
  owner_id: string;
  /** Set on touchpoint items — lets the caller open that partner's detail panel directly. */
  partnerId?: string;
  /** Set on every other kind — lets the caller switch to the tab that manages this item. */
  navigateTab?: HomeNavTarget;
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
  cadence_days: number | null;
  last_touchpoint_at: string | null;
  created_at: string;
}

interface CollateralRow {
  id: string;
  item_name: string;
  owner_id: string | null;
  active: boolean;
  cadence_days: number | null;
  last_reviewed_at: string | null;
}

interface ConnectionRow {
  id: string;
  name: string;
  event_id: string | null;
  followup_due: string | null;
  followup_done: boolean;
  owner_id: string | null;
}

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
  status: string;
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
  ] = await Promise.all([
    supabase
      .from('partners')
      .select('id, name, owner_id, active, stage, cadence_days, last_touchpoint_at, created_at')
      .eq('active', true),
    supabase
      .from('partnership_collateral')
      .select('id, item_name, owner_id, active, cadence_days, last_reviewed_at')
      .eq('active', true),
    supabase
      .from('partnership_connections')
      .select('id, name, event_id, followup_due, followup_done, owner_id')
      .eq('followup_done', false),
    supabase.from('partnership_events').select('id, event_name'),
    supabase.from('partnership_recurring_settings').select('kind, cadence_days, lead_time_days, owner_id'),
    supabase.from('partnership_social_posts').select('planned_date, status'),
    supabase.from('partnership_comms').select('id, title, publish_date, status').eq('status', 'not_started'),
  ]);

  for (const res of [partnersRes, collateralRes, connectionsRes, eventsRes, settingsRes, socialRes, commsRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const partners = (partnersRes.data ?? []) as PartnerRow[];
  const collateral = (collateralRes.data ?? []) as CollateralRow[];
  const connections = (connectionsRes.data ?? []) as ConnectionRow[];
  const events = (eventsRes.data ?? []) as EventRow[];
  const settings = (settingsRes.data ?? []) as RecurringSettingRow[];
  const socialPosts = (socialRes.data ?? []) as SocialPostRow[];
  const comms = (commsRes.data ?? []) as CommRow[];

  const today = localDate();
  const items: HomeItem[] = [];

  // 1. Partner touchpoints coming due — mirrors emit_due_touchpoint_tasks().
  for (const p of partners) {
    if (!p.owner_id || p.cadence_days == null) continue;
    if (p.stage !== 'active' && p.stage !== 'prospect') continue;
    const anchor = dateOnly(p.last_touchpoint_at ?? p.created_at);
    const due = addDays(anchor, p.cadence_days);
    if (!inScope(due, today)) continue;
    items.push({
      key: `touchpoint:${p.id}`,
      kind: 'touchpoint',
      title: `Touchpoint due — ${p.name}`,
      due_date: due,
      owner_id: p.owner_id,
      partnerId: p.id,
    });
  }

  // 2. Collateral needing review — mirrors emit_collateral_review_tasks().
  for (const c of collateral) {
    if (!c.owner_id || c.cadence_days == null || !c.last_reviewed_at) continue;
    const due = addDays(c.last_reviewed_at, c.cadence_days);
    if (!inScope(due, today)) continue;
    items.push({
      key: `collateral:${c.id}`,
      kind: 'collateral',
      title: `Collateral review — ${c.item_name}`,
      due_date: due,
      owner_id: c.owner_id,
      navigateTab: 'collateral',
    });
  }

  // 3. Connection follow-ups due — mirrors emit_overdue_connection_followups().
  const eventNameById = new Map(events.map((e) => [e.id, e.event_name]));
  for (const c of connections) {
    if (!c.owner_id || !c.followup_due) continue;
    if (!inScope(c.followup_due, today)) continue;
    const eventName = c.event_id ? eventNameById.get(c.event_id) : undefined;
    items.push({
      key: `connection:${c.id}`,
      kind: 'connection',
      title: `Follow up with ${c.name}${eventName ? ` — from ${eventName}` : ''}`,
      due_date: c.followup_due,
      owner_id: c.owner_id,
      navigateTab: 'events',
    });
  }

  // 4. Social posting reminder — mirrors emit_social_post_reminder() exactly: nags only
  // when BOTH sides fail (no recent post AND nothing already planned ahead of the gap).
  const socialCfg = settings.find((s) => s.kind === 'social_post');
  if (socialCfg) {
    const posted = socialPosts.filter((s) => s.status === 'posted' && s.planned_date);
    const lastPosted = posted.length
      ? posted.map((s) => s.planned_date as string).sort().at(-1)!
      : null;
    const plannedAhead = socialPosts.filter(
      (s) => (s.status === 'planned' || s.status === 'scheduled') && s.planned_date && s.planned_date >= today,
    );
    const nextPlanned = plannedAhead.length
      ? plannedAhead.map((s) => s.planned_date as string).sort()[0]
      : null;
    const daysSinceLast = lastPosted ? daysBetween(lastPosted, today) : Infinity;
    const daysToNext = nextPlanned ? daysBetween(today, nextPlanned) : Infinity;
    if (daysSinceLast > socialCfg.cadence_days && daysToNext > socialCfg.lead_time_days) {
      items.push({
        key: 'social_post:reminder',
        kind: 'social_post',
        title: `Social post needed — none posted in ${socialCfg.cadence_days}+ days`,
        due_date: today,
        owner_id: socialCfg.owner_id,
        navigateTab: 'social',
      });
    }
  }

  // 5. Newsletter/comms items coming due — mirrors emit_newsletter_reminder_tasks().
  const newsletterCfg = settings.find((s) => s.kind === 'newsletter');
  if (newsletterCfg) {
    for (const c of comms) {
      if (!inScope(c.publish_date, today)) continue;
      items.push({
        key: `comms:${c.id}`,
        kind: 'newsletter',
        title: c.title,
        due_date: c.publish_date,
        owner_id: newsletterCfg.owner_id,
        navigateTab: 'comms',
      });
    }
  }

  return items.sort((a, b) => a.due_date.localeCompare(b.due_date));
}
