import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import ICAL from 'https://esm.sh/ical.js@2.1.0';

// Pulls a person's own Google Calendar (via the secret ICS address they paste into
// Settings) into their Personal tab as ordinary, read-only-in-Sparrow calendar_events
// rows -- tagged source_system='google_import' so they flow through every existing
// personal-event surface (Calendar tab, My Week, Upcoming Meetings) with no separate
// wiring, and so the export feed (see export-calendar-ics) knows to exclude them and
// avoid echoing them back into Google Calendar. See 0170.
//
// Parsing uses ical.js rather than a hand-rolled reader because real Google feeds need it:
// recurring meetings are ONE event with an RRULE (plus EXDATEs and moved/cancelled
// instances), and their times are local (TZID=America/Los_Angeles) with the zone rules
// in a VTIMEZONE block. The old reader imported only the first occurrence of every
// recurring series and read local times as UTC (7-8 hours off).
//
// Only a rolling window is imported (IMPORT_PAST_DAYS back, IMPORT_FUTURE_DAYS ahead) --
// Google's feed contains the person's entire history, and recurring series are infinite.

const IMPORT_PAST_DAYS = 30;
const IMPORT_FUTURE_DAYS = 180;
// The calendar page triggers a sync on every load; don't re-fetch Google more often than this.
const MIN_RESYNC_MINUTES = 5;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// --- parser start (pure; exercised by a local Node test harness) ---
interface ParsedOccurrence {
  key: string;            // stable per occurrence: UID, plus the occurrence's original start for recurring series
  summary: string;
  location: string | null;
  allDay: boolean;
  startsAt: string;       // ISO. All-day: YYYY-MM-DDT00:00:00.000Z (app convention)
  endsAt: string | null;  // ISO. All-day: INCLUSIVE last day at T00:00Z, or null for a single day (app convention)
}

// deno-lint-ignore no-explicit-any
function parseFeed(ICALlib: any, icsText: string, windowStart: Date, windowEnd: Date): ParsedOccurrence[] {
  const root = new ICALlib.Component(ICALlib.parse(icsText));
  for (const tz of root.getAllSubcomponents('vtimezone')) {
    try { ICALlib.TimezoneService.register(tz); } catch { /* malformed zone: times fall back to floating */ }
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  // deno-lint-ignore no-explicit-any
  const dateOnlyIso = (t: any) => `${t.year}-${pad(t.month)}-${pad(t.day)}T00:00:00.000Z`;
  // deno-lint-ignore no-explicit-any
  const toIso = (t: any) => (t.isDate ? dateOnlyIso(t) : t.toJSDate().toISOString());

  // deno-lint-ignore no-explicit-any
  function toOccurrence(key: string, item: any, start: any, end: any): ParsedOccurrence | null {
    if (!start) return null;
    const status = String(item.component.getFirstPropertyValue('status') ?? '').toUpperCase();
    if (status === 'CANCELLED') return null;
    const summary = (item.summary ?? '').trim() || '(No title)';
    const location = (item.location ?? '').trim() || null;
    if (start.isDate) {
      let endsAt: string | null = null;
      if (end) {
        // iCal all-day DTEND is exclusive; the app stores the inclusive last day.
        const last = end.clone();
        last.adjust(-1, 0, 0, 0);
        if (last.compare(start) > 0) endsAt = dateOnlyIso(last);
      }
      return { key, summary, location, allDay: true, startsAt: dateOnlyIso(start), endsAt };
    }
    return { key, summary, location, allDay: false, startsAt: toIso(start), endsAt: end ? toIso(end) : null };
  }

  const inWindow = (startIso: string, endIso: string | null) => {
    const s = new Date(startIso).getTime();
    const e = endIso ? new Date(endIso).getTime() : s;
    return e >= windowStart.getTime() && s <= windowEnd.getTime();
  };

  const vevents = root.getAllSubcomponents('vevent');
  // Moved/edited single instances of a recurring series ("this event only" edits).
  // deno-lint-ignore no-explicit-any
  const exceptionsByUid = new Map<string, any[]>();
  for (const v of vevents) {
    if (v.hasProperty('recurrence-id')) {
      const uid = v.getFirstPropertyValue('uid');
      if (!exceptionsByUid.has(uid)) exceptionsByUid.set(uid, []);
      exceptionsByUid.get(uid)!.push(v);
    }
  }

  const out: ParsedOccurrence[] = [];
  for (const v of vevents) {
    if (v.hasProperty('recurrence-id')) continue; // handled via its master below
    const ev = new ICALlib.Event(v);
    const uid = ev.uid;
    if (!uid || !ev.startDate) continue;

    if (!ev.isRecurring()) {
      const occ = toOccurrence(uid, ev, ev.startDate, ev.endDate);
      if (occ && inWindow(occ.startsAt, occ.endsAt)) out.push(occ);
      continue;
    }

    for (const exc of exceptionsByUid.get(uid) ?? []) {
      try { ev.relateException(exc); } catch { /* exception for a different series: ignore */ }
    }
    const iterator = ev.iterator();
    const endLimit = ICALlib.Time.fromJSDate(windowEnd, true);
    let safety = 0;
    for (let next = iterator.next(); next && safety < 5000; next = iterator.next(), safety++) {
      if (next.compare(endLimit) > 0) break;
      const details = ev.getOccurrenceDetails(next);
      const key = `${uid}:${toIso(details.recurrenceId)}`;
      const occ = toOccurrence(key, details.item, details.startDate, details.endDate);
      if (occ && inWindow(occ.startsAt, occ.endsAt)) out.push(occ);
    }
  }
  return out;
}
// --- parser end ---

interface ExistingRow {
  id: string;
  source_ref: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
}

const sameInstant = (a: string | null, b: string | null) =>
  a === b || (a !== null && b !== null && new Date(a).getTime() === new Date(b).getTime());

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Verify the caller is actually who they claim to be — this endpoint writes
  // calendar_events rows on someone's behalf, so it must not trust a bare userId.
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !userData?.user) return json({ error: 'Not authenticated' }, 401);
  const userId = userData.user.id;

  const { force } = await req.json().catch(() => ({})) as { force?: boolean };

  const { data: profile } = await supabase
    .from('profiles')
    .select('google_calendar_import_url, google_calendar_last_synced_at')
    .eq('id', userId)
    .single();

  const importUrl = profile?.google_calendar_import_url as string | null;
  if (!importUrl) {
    // Link removed in Settings: take that person's previously imported events back out.
    await supabase.from('calendar_events').delete()
      .eq('source_system', 'google_import').eq('created_by', userId);
    return json({ synced: 0, reason: 'no import url set' });
  }

  const lastSynced = profile?.google_calendar_last_synced_at as string | null;
  if (!force && lastSynced && Date.now() - new Date(lastSynced).getTime() < MIN_RESYNC_MINUTES * 60_000) {
    return json({ synced: 0, reason: 'synced recently' });
  }

  let icsText: string;
  try {
    // Google shows the secret address as https://; some people paste the webcal:// form.
    const res = await fetch(importUrl.trim().replace(/^webcal:\/\//i, 'https://'));
    if (!res.ok) throw new Error(`Google answered ${res.status}`);
    icsText = await res.text();
    if (!icsText.includes('BEGIN:VCALENDAR')) throw new Error('that link is not a calendar (use the "Secret address in iCal format")');
  } catch (e) {
    return json({ error: `Could not read that Google Calendar link: ${e instanceof Error ? e.message : e}` });
  }

  const now = Date.now();
  const windowStart = new Date(now - IMPORT_PAST_DAYS * 86_400_000);
  const windowEnd = new Date(now + IMPORT_FUTURE_DAYS * 86_400_000);

  let parsed: ParsedOccurrence[];
  try {
    parsed = parseFeed(ICAL, icsText, windowStart, windowEnd);
  } catch (e) {
    return json({ error: `Could not read the calendar data: ${e instanceof Error ? e.message : e}` });
  }

  // Existing imported rows (paged: PostgREST caps a single select at 1000 rows).
  const existing: ExistingRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('calendar_events')
      .select('id, source_ref, title, starts_at, ends_at, all_day, location')
      .eq('source_system', 'google_import')
      .eq('created_by', userId)
      .range(from, from + 999);
    if (error) return json({ error: `Could not load existing imported events: ${error.message}` }, 500);
    existing.push(...((data ?? []) as ExistingRow[]));
    if (!data || data.length < 1000) break;
  }
  const existingByRef = new Map(existing.map((r) => [r.source_ref, r]));

  // Deliberately not a plain .upsert(): calendar_events_source_uniq (0091) is a *partial*
  // unique index, which ON CONFLICT can't target from the JS client (see 0114's history).
  // Select-then-update-or-insert instead; only rows that actually changed are written.
  const toInsert: Record<string, unknown>[] = [];
  const currentRefs = new Set<string>();
  let updated = 0;
  for (const ev of parsed) {
    const sourceRef = `${userId}:${ev.key}`;
    if (currentRefs.has(sourceRef)) continue; // duplicate UID in feed
    currentRefs.add(sourceRef);
    const patch = {
      title: ev.summary,
      starts_at: ev.startsAt,
      ends_at: ev.endsAt,
      all_day: ev.allDay,
      location: ev.location,
    };
    const row = existingByRef.get(sourceRef);
    if (!row) {
      toInsert.push({
        ...patch,
        is_personal: true,
        department: null,
        created_by: userId,
        source_system: 'google_import',
        source_ref: sourceRef,
      });
    } else if (
      row.title !== patch.title || row.all_day !== patch.all_day || (row.location ?? null) !== patch.location ||
      !sameInstant(row.starts_at, patch.starts_at) || !sameInstant(row.ends_at, patch.ends_at)
    ) {
      const { error } = await supabase.from('calendar_events').update(patch).eq('id', row.id);
      if (!error) updated++;
    }
  }

  for (let i = 0; i < toInsert.length; i += 500) {
    const { error } = await supabase.from('calendar_events').insert(toInsert.slice(i, i + 500));
    if (error) return json({ error: `Could not save imported events: ${error.message}` }, 500);
  }

  // Prune previously-imported rows no longer in the current window/feed (deleted, moved,
  // or simply aged out of the window).
  const staleIds = existing.filter((r) => !currentRefs.has(r.source_ref)).map((r) => r.id);
  for (let i = 0; i < staleIds.length; i += 200) {
    await supabase.from('calendar_events').delete().in('id', staleIds.slice(i, i + 200));
  }

  await supabase
    .from('profiles')
    .update({ google_calendar_last_synced_at: new Date().toISOString() })
    .eq('id', userId);

  return json({ synced: parsed.length, inserted: toInsert.length, updated, pruned: staleIds.length });
});
