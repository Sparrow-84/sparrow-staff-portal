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

function htmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toIcsUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
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
    lines.push(`DTSTART;VALUE=DATE:${opts.startsAt.slice(0, 10).replace(/-/g, '')}`);
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
}): string {
  const noteBlock = opts.note
    ? `<div style="border-left:3px solid #F0A500;padding:2px 0 2px 16px;margin:0 0 24px;">
         <p style="margin:0;font-size:14.5px;font-style:italic;color:#1A1A1A;line-height:1.6;">&ldquo;${htmlEscape(opts.note)}&rdquo;</p>
         <span style="font-style:normal;font-size:12.5px;color:#767676;margin-top:6px;display:block;">&mdash; ${htmlEscape(opts.organizerName)}</span>
       </div>`
    : '';
  const locationRow = opts.location
    ? `<div style="font-size:14.5px;color:#1A1A1A;margin-top:10px;"><span style="color:#767676;font-size:12.5px;text-transform:uppercase;letter-spacing:.05em;display:block;">Location</span>${htmlEscape(opts.location)}</div>`
    : '';

  return `<!doctype html><html><body style="margin:0;padding:0;background:#F5F5F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#FFFFFF;">
      <div style="padding:44px 48px 40px;">
        <p style="font-family:Georgia,serif;font-weight:600;font-size:19px;color:#1E4D30;margin:0 0 34px;">Sparrow</p>
        <p style="font-size:12.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#767676;margin:0 0 10px;">Calendar invite</p>
        <h1 style="font-family:Georgia,serif;font-weight:600;font-size:27px;line-height:1.28;color:#1E4D30;margin:0 0 8px;">You're invited to a meeting</h1>
        <p style="font-size:15px;line-height:1.6;color:#1A1A1A;margin:0 0 30px;"><strong style="color:#1E4D30;">${htmlEscape(opts.organizerName)}</strong> invited you to an event on the Sparrow calendar.</p>
        <div style="background:#E8F2EC;border-radius:12px;padding:22px 24px;margin-bottom:26px;">
          <p style="font-family:Georgia,serif;font-weight:600;font-size:19px;color:#1E4D30;margin:0 0 12px;">${htmlEscape(opts.title)}</p>
          <div style="font-size:14.5px;color:#1A1A1A;"><span style="color:#767676;font-size:12.5px;text-transform:uppercase;letter-spacing:.05em;display:block;">Date &amp; time</span>${htmlEscape(opts.whenLabel)}</div>
          ${locationRow}
        </div>
        ${noteBlock}
        <p style="font-size:13.5px;color:#767676;line-height:1.6;margin:0 0 30px;">Need to reschedule? Just reply to this email, or reach ${htmlEscape(opts.organizerName)} directly${opts.signatureHtml ? ' — see below' : ` at ${opts.organizerEmail}`}.</p>
        <hr style="border:none;border-top:1px solid #D8D8D8;margin:0 0 24px;" />
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

Deno.serve(async (req) => {
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

  const whenLabel = event.all_day
    ? new Date(event.starts_at).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    : `${new Date(event.starts_at).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · ${new Date(event.starts_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}${event.ends_at ? ' – ' + new Date(event.ends_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''}`;

  const html = buildEmailHtml({
    organizerName: inviter.full_name ?? inviter.email,
    title: event.title,
    whenLabel,
    location: event.location,
    note,
    signatureHtml,
    organizerEmail: inviter.email,
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

  const boundary = `sparrow_${crypto.randomUUID()}`;
  const subject = `You're invited: ${event.title}`;
  const mime =
    `From: ${inviter.full_name ?? 'Sparrow'} <${inviter.email}>\r\n` +
    `To: ${email}\r\n` +
    `Subject: ${subject}\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/html; charset="UTF-8"\r\n\r\n${html}\r\n\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/calendar; method=REQUEST; charset="UTF-8"\r\n` +
    `Content-Disposition: attachment; filename="invite.ics"\r\n\r\n${ics}\r\n\r\n` +
    `--${boundary}--`;

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
});
