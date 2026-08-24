import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Pulls a person's own Google Calendar (via the secret ICS address they paste into
// Settings) into their Personal tab as ordinary, read-only-in-Sparrow calendar_events
// rows -- tagged source_system='google_import' so they flow through every existing
// personal-event surface (Calendar tab, My Week, Upcoming Meetings) with no separate
// wiring, and so the export feed (see export-calendar-ics) knows to exclude them and
// avoid echoing them back into Google Calendar. See 0170.
//
// Known limitation: events with an explicit timezone (TZID) or a floating/local time
// (no trailing Z) are interpreted as UTC rather than resolved against a full timezone
// database -- a real gap for non-UTC timed events, not attempted here given the scope.
// All-day events and events already in UTC (the common case for most calendar exports)
// are unaffected.

interface ParsedEvent {
  uid: string;
  summary: string;
  location: string | null;
  allDay: boolean;
  startsAt: string; // ISO
  endsAt: string | null; // ISO
}

function unfold(ics: string): string[] {
  const rawLines = ics.split(/\r\n|\n|\r/);
  const lines: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function parseDate(prop: string, value: string): { iso: string; allDay: boolean } {
  const isDateOnly = prop.includes('VALUE=DATE') || /^\d{8}$/.test(value);
  if (isDateOnly) {
    const y = value.slice(0, 4), m = value.slice(4, 6), d = value.slice(6, 8);
    return { iso: `${y}-${m}-${d}T00:00:00.000Z`, allDay: true };
  }
  // YYYYMMDDTHHMMSS(Z)?
  const m2 = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!m2) return { iso: new Date().toISOString(), allDay: false };
  const [, y, mo, d, h, mi, s] = m2;
  return { iso: `${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`, allDay: false };
}

function parseIcs(ics: string): ParsedEvent[] {
  const lines = unfold(ics);
  const events: ParsedEvent[] = [];
  let cur: Partial<ParsedEvent> & { startsAllDay?: boolean } | null = null;

  for (const raw of lines) {
    if (raw === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (raw === 'END:VEVENT') {
      if (cur?.uid && cur.summary && cur.startsAt) {
        events.push({
          uid: cur.uid,
          summary: cur.summary,
          location: cur.location ?? null,
          allDay: !!cur.allDay,
          startsAt: cur.startsAt,
          endsAt: cur.endsAt ?? null,
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const colonIdx = raw.indexOf(':');
    if (colonIdx === -1) continue;
    const prop = raw.slice(0, colonIdx);
    const value = raw.slice(colonIdx + 1);
    const propName = prop.split(';')[0];

    if (propName === 'UID') cur.uid = value;
    else if (propName === 'SUMMARY') cur.summary = value.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/gi, ' ');
    else if (propName === 'LOCATION') cur.location = value.replace(/\\,/g, ',').replace(/\\;/g, ';');
    else if (propName === 'DTSTART') {
      const { iso, allDay } = parseDate(prop, value);
      cur.startsAt = iso;
      cur.allDay = allDay;
    } else if (propName === 'DTEND') {
      const { iso } = parseDate(prop, value);
      cur.endsAt = iso;
    }
  }

  return events;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Verify the caller is actually who they claim to be — this endpoint writes
  // calendar_events rows on someone's behalf, so it must not trust a bare userId.
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  const { data: userData, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !userData?.user) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  const userId = userData.user.id;

  const { data: profile } = await supabase
    .from('profiles')
    .select('google_calendar_import_url')
    .eq('id', userId)
    .single();

  const importUrl = profile?.google_calendar_import_url as string | null;
  if (!importUrl) {
    return new Response(JSON.stringify({ synced: 0, reason: 'no import url set' }), { status: 200 });
  }

  let icsText: string;
  try {
    const res = await fetch(importUrl);
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    icsText = await res.text();
  } catch (e) {
    return new Response(JSON.stringify({ error: `Could not reach that Google Calendar link: ${e instanceof Error ? e.message : e}` }), { status: 200 });
  }

  const parsed = parseIcs(icsText);
  const currentRefs = new Set(parsed.map((p) => `${userId}:${p.uid}`));

  // Deliberately not a plain .upsert() here: calendar_events_source_uniq (0091) is a
  // *partial* unique index (WHERE source_system IS NOT NULL), and Postgres won't use a
  // partial index as an ON CONFLICT arbiter unless the same WHERE predicate is repeated in
  // the conflict clause -- something the Supabase JS client's upsert() can't express. This
  // exact class of bug already bit an earlier migration in this codebase (see 0114's
  // history) -- doing an explicit select-then-update-or-insert sidesteps it entirely.
  const { data: existing } = await supabase
    .from('calendar_events')
    .select('id, source_ref')
    .eq('source_system', 'google_import')
    .eq('created_by', userId);

  const existingByRef = new Map((existing ?? []).map((r) => [r.source_ref as string, r.id as string]));

  for (const ev of parsed) {
    const sourceRef = `${userId}:${ev.uid}`;
    const patch = {
      title: ev.summary,
      starts_at: ev.startsAt,
      ends_at: ev.endsAt,
      all_day: ev.allDay,
      location: ev.location,
      is_personal: true,
      department: null,
      created_by: userId,
      source_system: 'google_import',
      source_ref: sourceRef,
    };
    const existingId = existingByRef.get(sourceRef);
    if (existingId) {
      await supabase.from('calendar_events').update(patch).eq('id', existingId);
    } else {
      await supabase.from('calendar_events').insert(patch);
    }
  }

  // Prune previously-imported events that no longer appear in the current feed
  // (edited-away, moved, or deleted on the Google side).
  const staleIds = [...existingByRef.entries()]
    .filter(([ref]) => !currentRefs.has(ref))
    .map(([, id]) => id);
  if (staleIds.length > 0) {
    await supabase.from('calendar_events').delete().in('id', staleIds);
  }

  await supabase
    .from('profiles')
    .update({ google_calendar_last_synced_at: new Date().toISOString() })
    .eq('id', userId);

  return new Response(JSON.stringify({ synced: parsed.length, pruned: staleIds.length }), { status: 200 });
});
