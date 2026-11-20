import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SignJWT, importPKCS8 } from 'https://esm.sh/jose@5';

// Sends a branded calendar-invite email to someone outside Sparrow, genuinely through the
// inviter's own real @sparrowinc.org Gmail account (via Google Workspace domain-wide
// delegation) — not a separate system address. That's deliberate: it means the email
// carries the inviter's real, live Gmail signature automatically, it lands in their own
// Sent folder just like anything else they've sent, and a reply goes straight to their
// normal inbox — nothing Sparrow-specific to check. See Design Session E, part 1.
//
// Requires Byron to have configured, on the Workspace admin side: a Google Cloud service
// account with domain-wide delegation authorized for the gmail.send and
// gmail.settings.basic scopes, its JSON key stored here as GOOGLE_SERVICE_ACCOUNT_JSON.
// Until that exists, this returns a clear "not configured" error rather than silently
// failing or pretending to send.

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// Public copy of the green circle logo, served by the staff portal's static site.
const LOGO_URL = 'https://staff.sparrowinc.org/brand/logo-primary-circle-green.png';

// Email headers must be plain ASCII; anything else (an en dash, an accented name) has to
// be RFC 2047 encoded or mail clients show it as garbage like "â€“".
function encodeHeader(s: string): string {
  if (/^[\x20-\x7E]*$/.test(s)) return s;
  const bytes = new TextEncoder().encode(s);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

// Must match SPARROW_OFFICE_LOCATION in src/lib/sparrowOffice.ts. That's what the
// "Sparrow Office" checkbox on the event form saves as the location. Only those events get
// the office address and parking instructions.
const SPARROW_OFFICE_ADDRESS = '245 SW Twin Oaks Cir, Corvallis, OR 97333';
const SPARROW_OFFICE_LOCATION = `Sparrow Office: ${SPARROW_OFFICE_ADDRESS}`;
const SPARROW_OFFICE_MAPS_URL = 'https://www.google.com/maps/search/?api=1&query=245+SW+Twin+Oaks+Cir%2C+Corvallis%2C+OR+97333';

function isSparrowOffice(location: string | null): boolean {
  return (location ?? '').trim() === SPARROW_OFFICE_LOCATION;
}

function htmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toIcsUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

// The app stores an all-day event's INCLUSIVE last day (or null for one day); calendars
// want an EXCLUSIVE end date. Returns both as YYYYMMDD.
function allDayRange(startsAt: string, endsAt: string | null): { start: string; endExclusive: string } {
  const startDay = startsAt.slice(0, 10);
  const [y, m, d] = (endsAt ? endsAt.slice(0, 10) : startDay).split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { start: startDay.replace(/-/g, ''), endExclusive: end.replace(/-/g, '') };
}

// One-click "Add to Google Calendar" link -- works for any Google user no matter how
// their mail app treats the attached invite.
function googleCalendarUrl(opts: {
  title: string; startsAt: string; endsAt: string | null; allDay: boolean; location: string | null;
}): string {
  let dates: string;
  if (opts.allDay) {
    const { start, endExclusive } = allDayRange(opts.startsAt, opts.endsAt);
    dates = `${start}/${endExclusive}`;
  } else {
    dates = `${toIcsUtc(opts.startsAt)}/${toIcsUtc(opts.endsAt ?? opts.startsAt)}`;
  }
  const params = new URLSearchParams({ action: 'TEMPLATE', text: opts.title, dates, ctz: 'America/Los_Angeles' });
  if (opts.location) params.set('location', opts.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function buildIcsInvite(opts: {
  eventId: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  location: string | null;
  organizerEmail: string;
  organizerName: string;
  attendeeEmail: string;
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sparrow//External Invite//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${opts.eventId}@sparrowinc.org`,
    `DTSTAMP:${toIcsUtc(new Date().toISOString())}`,
  ];
  if (opts.allDay) {
    const { start, endExclusive } = allDayRange(opts.startsAt, opts.endsAt);
    lines.push(`DTSTART;VALUE=DATE:${start}`);
    lines.push(`DTEND;VALUE=DATE:${endExclusive}`);
  } else {
    lines.push(`DTSTART:${toIcsUtc(opts.startsAt)}`);
    lines.push(`DTEND:${toIcsUtc(opts.endsAt ?? opts.startsAt)}`);
  }
  lines.push(`SUMMARY:${icsEscape(opts.title)}`);
  if (opts.location) lines.push(`LOCATION:${icsEscape(opts.location)}`);
  lines.push(`ORGANIZER;CN=${icsEscape(opts.organizerName)}:mailto:${opts.organizerEmail}`);
  lines.push(`ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${opts.attendeeEmail}`);
  lines.push('STATUS:CONFIRMED');
  lines.push('SEQUENCE:0');
  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function buildEmailHtml(opts: {
  organizerName: string;
  title: string;
  whenLabel: string;
  location: string | null;
  note: string | null;
  signatureHtml: string | null;
  organizerEmail: string;
  googleCalendarUrl: string;
}): string {
  const noteBlock = opts.note
    ? `<div style="border-left:3px solid #F0A500;padding:2px 0 2px 16px;margin:0 0 24px;">
         <p style="margin:0;font-size:14.5px;font-style:italic;color:#1A1A1A;line-height:1.6;">&ldquo;${htmlEscape(opts.note)}&rdquo;</p>
         <span style="font-style:normal;font-size:12.5px;color:#767676;margin-top:6px;display:block;">&mdash; ${htmlEscape(opts.organizerName)}</span>
       </div>`
    : '';
  const atOffice = isSparrowOffice(opts.location);
  const locationValue = atOffice
    ? `<strong style="color:#1E4D30;">Sparrow Office:</strong><br /><a href="${htmlEscape(SPARROW_OFFICE_MAPS_URL)}" style="color:#1E4D30;">${SPARROW_OFFICE_ADDRESS}</a>`
    : htmlEscape(opts.location ?? '');
  const locationRow = opts.location
    ? `<div style="font-size:14.5px;color:#1A1A1A;margin-top:10px;"><span style="color:#767676;font-size:12.5px;text-transform:uppercase;letter-spacing:.05em;display:block;">Location</span>${locationValue}</div>`
    : '';

  // The phone number lives in the inviter's Gmail signature; without one, point to a reply.
  const parkingFallbackLine = opts.signatureHtml
    ? `If you have any issues with parking, please give me a call. My number is below.`
    : `If you have any issues with parking, just reply to this email.`;

  // Only for events at the Sparrow Office; the address itself is in the card above.
  const parkingBlock = !atOffice ? '' : `
       <details style="margin:0 0 26px;">
         <summary style="cursor:pointer;font-size:14.5px;font-weight:700;color:#1E4D30;background:#E8F2EC;border-radius:10px;padding:14px 18px;">Parking Instructions</summary>
         <div style="padding:16px 6px 0;">
           <p style="font-size:14px;line-height:1.65;color:#1A1A1A;margin:0 0 12px;">After entering Twin Oaks, you'll see our office several buildings in, on the right &mdash; you can't miss our sign. There are two parking spots directly in front of our office that we always try to leave open for visiting guests. If both of these spots are taken, please continue driving down the main road. Guest parking is on the left, just past the resident mailboxes, in a gravel lot marked with guest parking signs.</p>
           <p style="font-size:14px;line-height:1.65;color:#1A1A1A;margin:0;">${parkingFallbackLine}</p>
         </div>
       </details>`;

  return `<!doctype html><html><body style="margin:0;padding:0;background:#F5F5F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#FFFFFF;">
      <div style="padding:44px 48px 40px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 34px;"><tr>
          <td style="vertical-align:middle;padding-right:10px;"><img src="${LOGO_URL}" width="36" height="36" alt="" style="display:block;width:36px;height:36px;border:0;" /></td>
          <td style="vertical-align:middle;font-family:Georgia,serif;font-weight:600;font-size:19px;color:#1E4D30;">Sparrow</td>
        </tr></table>
        <p style="font-size:12.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#767676;margin:0 0 10px;">Calendar invite</p>
        <h1 style="font-family:Georgia,serif;font-weight:600;font-size:27px;line-height:1.28;color:#1E4D30;margin:0 0 8px;">You're invited to a meeting</h1>
        <p style="font-size:15px;line-height:1.6;color:#1A1A1A;margin:0 0 30px;"><strong style="color:#1E4D30;">${htmlEscape(opts.organizerName)}</strong> invited you to an event on the Sparrow calendar.</p>
        <div style="background:#E8F2EC;border-radius:12px;padding:22px 24px;margin-bottom:26px;">
          <p style="font-family:Georgia,serif;font-weight:600;font-size:19px;color:#1E4D30;margin:0 0 12px;">${htmlEscape(opts.title)}</p>
          <div style="font-size:14.5px;color:#1A1A1A;"><span style="color:#767676;font-size:12.5px;text-transform:uppercase;letter-spacing:.05em;display:block;">Date &amp; time</span>${htmlEscape(opts.whenLabel)}</div>
          ${locationRow}
          <a href="${htmlEscape(opts.googleCalendarUrl)}" style="display:inline-block;margin-top:18px;background:#1E4D30;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;padding:10px 18px;">Add to Google Calendar</a>
        </div>
        ${parkingBlock}
        ${noteBlock}
        <hr style="border:none;border-top:1px solid #D8D8D8;margin:6px 0 24px;" />
        ${opts.signatureHtml ? `<div>${opts.signatureHtml}</div>` : ''}
      </div>
    </div>
  </body></html>`;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getDelegatedAccessToken(
  serviceAccount: { client_email: string; private_key: string },
  impersonateEmail: string,
  scopes: string[],
): Promise<string> {
  const privateKey = await importPKCS8(serviceAccount.private_key, 'RS256');
  const assertion = await new SignJWT({ scope: scopes.join(' ') })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(serviceAccount.client_email)
    .setSubject(impersonateEmail)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`Google token exchange failed: ${JSON.stringify(json)}`);
  }
  return json.access_token as string;
}

// The staff portal calls this from the browser (a different origin than supabase.co), so
// the browser sends a CORS preflight first and requires these headers on every response.
// Without them the request is blocked before it ever reaches this code, and supabase-js
// reports only "Failed to send a request to the Edge Function".
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const handled = await handle(req);
  const headers = new Headers(handled.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  headers.set('Content-Type', 'application/json');
  return new Response(handled.body, { status: handled.status, headers });
});

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  const { data: userData, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }
  const inviterId = userData.user.id;

  const { eventId, email, note } = await req.json() as { eventId: string; email: string; note: string | null };
  if (!eventId || !email) {
    return new Response(JSON.stringify({ error: 'Missing eventId or email' }), { status: 400 });
  }

  const [{ data: event }, { data: inviter }] = await Promise.all([
    supabase.from('calendar_events').select('id, title, starts_at, ends_at, all_day, location, created_by').eq('id', eventId).single(),
    supabase.from('profiles').select('id, full_name, email, role').eq('id', inviterId).single(),
  ]);

  if (!event) return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404 });
  if (!inviter?.email) return new Response(JSON.stringify({ error: 'Your profile has no email on file' }), { status: 400 });

  // Mirrors the DB-level permission rule (0169) — creator or admin only.
  if (event.created_by !== inviterId && inviter.role !== 'admin') {
    return new Response(JSON.stringify({ error: "You don't have permission to invite others to this event" }), { status: 403 });
  }

  const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!serviceAccountJson) {
    return new Response(JSON.stringify({
      error: 'Outside invites aren\'t set up yet — Byron needs to configure Google Workspace domain-wide delegation first.',
    }), { status: 200 });
  }

  let serviceAccount: { client_email: string; private_key: string };
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch {
    return new Response(JSON.stringify({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON' }), { status: 500 });
  }

  let accessToken: string;
  try {
    accessToken = await getDelegatedAccessToken(
      serviceAccount,
      inviter.email,
      ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.settings.basic'],
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: `Could not authorize as ${inviter.email}: ${e instanceof Error ? e.message : e}` }), { status: 500 });
  }

  // Best-effort: pull the inviter's real Gmail signature so the email reads as genuinely
  // theirs. If this fails, send without one rather than blocking the whole invite.
  let signatureHtml: string | null = null;
  try {
    const sigRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const sigJson = await sigRes.json();
    const primary = (sigJson.sendAs ?? []).find((s: { isPrimary?: boolean }) => s.isPrimary) ?? sigJson.sendAs?.[0];
    signatureHtml = primary?.signature || null;
  } catch {
    // non-fatal, see comment above
  }

  // Edge functions run in UTC; without an explicit zone a 10:00 AM meeting would read 6:00 PM.
  const tz = 'America/Los_Angeles';
  const whenLabel = event.all_day
    ? new Date(event.starts_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    : `${new Date(event.starts_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz })} · ${new Date(event.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })}${event.ends_at ? ' – ' + new Date(event.ends_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz, timeZoneName: 'short' }) : ''}`;

  const html = buildEmailHtml({
    organizerName: inviter.full_name ?? inviter.email,
    title: event.title,
    whenLabel,
    location: event.location,
    note,
    signatureHtml,
    organizerEmail: inviter.email,
    googleCalendarUrl: googleCalendarUrl({
      title: event.title,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      allDay: event.all_day,
      location: event.location,
    }),
  });

  const ics = buildIcsInvite({
    eventId: event.id,
    title: event.title,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    allDay: event.all_day,
    location: event.location,
    organizerEmail: inviter.email,
    organizerName: inviter.full_name ?? inviter.email,
    attendeeEmail: email,
  });

  // Same structure Google Calendar and Outlook use for real invites: the calendar data is
  // an INLINE text/calendar alternative (that's what makes Gmail show its Yes/Maybe/No
  // invite card and put the event on the guest's Google Calendar), plus a separate .ics
  // attachment for mail apps that only look at attachments. A bare .ics attachment alone
  // is often shown as just a file.
  const mixed = `sparrow_mixed_${crypto.randomUUID()}`;
  const alt = `sparrow_alt_${crypto.randomUUID()}`;
  const subject = `You're invited: ${event.title}`;
  const plain = `${inviter.full_name ?? inviter.email} invited you to: ${event.title}\r\n${whenLabel}` +
    `${event.location ? `\r\n${event.location}` : ''}`;
  const mime =
    `From: ${encodeHeader(inviter.full_name ?? 'Sparrow')} <${inviter.email}>\r\n` +
    `To: ${email}\r\n` +
    `Subject: ${encodeHeader(subject)}\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: multipart/mixed; boundary="${mixed}"\r\n\r\n` +
    `--${mixed}\r\n` +
    `Content-Type: multipart/alternative; boundary="${alt}"\r\n\r\n` +
    `--${alt}\r\n` +
    `Content-Type: text/plain; charset="UTF-8"\r\n\r\n${plain}\r\n\r\n` +
    `--${alt}\r\n` +
    `Content-Type: text/html; charset="UTF-8"\r\n\r\n${html}\r\n\r\n` +
    `--${alt}\r\n` +
    `Content-Type: text/calendar; method=REQUEST; charset="UTF-8"\r\n\r\n${ics}\r\n\r\n` +
    `--${alt}--\r\n\r\n` +
    `--${mixed}\r\n` +
    `Content-Type: application/ics; name="invite.ics"\r\n` +
    `Content-Disposition: attachment; filename="invite.ics"\r\n\r\n${ics}\r\n\r\n` +
    `--${mixed}--`;

  const raw = base64UrlEncode(new TextEncoder().encode(mime));

  const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  if (!sendRes.ok) {
    const errBody = await sendRes.text();
    return new Response(JSON.stringify({ error: `Gmail send failed: ${errBody}` }), { status: 502 });
  }

  await supabase.from('event_external_invites').insert({
    event_id: eventId,
    invited_email: email,
    note,
    invited_by: inviterId,
  });

  return new Response(JSON.stringify({ sent: true }), { status: 200 });
}
