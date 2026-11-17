import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Public, token-authenticated ICS feed for one person's effective calendar (mirrors the
// same "My Depts + All Staff + Personal" agenda logic the app's own Personal tab uses —
// see CalendarView.tsx's isAttendingOrMine/isMyAgenda). No Supabase auth session exists
// here (Google Calendar's subscription mechanism can't send one) — the token itself is
// the credential, same pattern as Google's own "secret address in iCal format."
//
// Deliberately excludes anything tagged source_system='google_import' — those rows exist
// because this SAME person's own Google Calendar was pulled in elsewhere; re-exporting them
// here would echo them straight back into Google Calendar as a duplicate. See 0170.

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function foldLine(line: string): string {
  // RFC 5545 requires folding lines longer than 75 octets — most real clients tolerate
  // unfolded lines fine, but Google Calendar is a bit stricter on very long SUMMARY/DESCRIPTION.
  if (line.length <= 75) return line;
  let out = line.slice(0, 75);
  let rest = line.slice(75);
  while (rest.length > 0) {
    out += '\r\n ' + rest.slice(0, 74);
    rest = rest.slice(74);
  }
  return out;
}

function toIcsUtc(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function toIcsDate(dateOnly: string): string {
  return dateOnly.replace(/-/g, '');
}

function addDays(dateOnly: string, days: number): string {
  const [y, m, d] = dateOnly.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

interface CalEvent {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  department: string | null;
  is_personal: boolean;
  created_by: string | null;
  source_system: string | null;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) return new Response('Missing token', { status: 400 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('google_calendar_export_token', token)
    .maybeSingle();
  if (!profile) return new Response('Invalid or revoked link', { status: 404 });

  const userId = profile.id as string;

  // Paged: PostgREST returns at most 1000 rows per select, which would silently drop
  // events once the org calendar grows past that. Only the last year onward is exported.
  const since = new Date(Date.now() - 365 * 86_400_000).toISOString();
  const events: CalEvent[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from('calendar_events')
      .select('id, title, starts_at, ends_at, all_day, location, department, is_personal, created_by, source_system')
      .gte('starts_at', since)
      .order('starts_at')
      .range(from, from + 999);
    events.push(...((data ?? []) as CalEvent[]));
    if (!data || data.length < 1000) break;
  }
  const { data: attendance } = await supabase
    .from('event_attendees').select('event_id, status').eq('staff_id', userId);

  const attendanceMap = new Map((attendance ?? []).map((a) => [a.event_id, a.status]));

  function isMyAgenda(ev: CalEvent): boolean {
    if (ev.is_personal) return ev.created_by === userId && ev.source_system !== 'google_import';
    if (ev.department === null) return attendanceMap.get(ev.id) !== 'opted_out';
    return attendanceMap.get(ev.id) === 'attending' || ev.created_by === userId;
  }

  const visible = events.filter(isMyAgenda);

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sparrow//Staff Calendar Export//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Sparrow Calendar',
  ];

  for (const ev of visible) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.id}@sparrowinc.org`);
    lines.push(`DTSTAMP:${toIcsUtc(new Date().toISOString())}`);
    if (ev.all_day) {
      const startDate = ev.starts_at.slice(0, 10);
      // The app stores an all-day event's INCLUSIVE last day; iCal DTEND is exclusive.
      const endDate = addDays(ev.ends_at ? ev.ends_at.slice(0, 10) : startDate, 1);
      lines.push(`DTSTART;VALUE=DATE:${toIcsDate(startDate)}`);
      lines.push(`DTEND;VALUE=DATE:${toIcsDate(endDate)}`);
    } else {
      lines.push(`DTSTART:${toIcsUtc(ev.starts_at)}`);
      lines.push(`DTEND:${toIcsUtc(ev.ends_at ?? ev.starts_at)}`);
    }
    lines.push(foldLine(`SUMMARY:${icsEscape(ev.title)}`));
    if (ev.location) lines.push(foldLine(`LOCATION:${icsEscape(ev.location)}`));
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  return new Response(lines.join('\r\n') + '\r\n', {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="sparrow-calendar.ics"',
      'Cache-Control': 'no-cache',
    },
  });
});
