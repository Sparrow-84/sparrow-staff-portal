// SHELVED ON PURPOSE — not dead code, not forgotten. Twin Oaks emergency SMS
// blast, fully built, deliberately never deployed: Twilio costs money for a
// feature that would rarely if ever be used, and more importantly, residents
// coming to expect/rely on a staff-sent alert during a real emergency (e.g. a
// fire) is a liability Sparrow doesn't want as a property owner, not an
// emergency-response entity. Kept as-is so this can be picked up without
// rebuilding if ever reconsidered — no Twilio account exists; that would be
// step one. Do not deploy or wire up a frontend trigger without Susanna
// explicitly asking to revisit this.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TWILIO_SID        = Deno.env.get('TWILIO_ACCOUNT_SID')!;
const TWILIO_TOKEN      = Deno.env.get('TWILIO_AUTH_TOKEN')!;
const TWILIO_FROM       = Deno.env.get('TWILIO_FROM_NUMBER')!;

// ── CORS headers for Supabase invokeFunction ──────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // ── Auth: must be a signed-in admin or TOC staff member ──────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const callerClient = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authErr } = await callerClient.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // Verify role — must be admin or toc department
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE);
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('role, department')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.department !== 'toc')) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Parse request body ───────────────────────────────────────────────
  const body = await req.json().catch(() => null);
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return new Response(JSON.stringify({ error: 'message is required' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Fetch opted-in members with phone numbers ────────────────────────
  const { data: members, error: fetchErr } = await serviceClient
    .from('household_members')
    .select('id, name, phone')
    .eq('park_chat_opt_in', true)
    .not('phone', 'is', null);

  if (fetchErr) {
    return new Response(JSON.stringify({ error: fetchErr.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Send via Twilio ──────────────────────────────────────────────────
  const recipients = (members ?? []) as { id: string; name: string; phone: string }[];
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const basicAuth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);

  for (const r of recipients) {
    const body = new URLSearchParams({
      From: TWILIO_FROM,
      To: r.phone,
      Body: `[Twin Oaks Emergency Alert]\n${message}`,
    });

    const res = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (res.ok) {
      sent++;
    } else {
      failed++;
      const detail = await res.json().catch(() => null);
      errors.push(`${r.name}: ${detail?.message ?? res.statusText}`);
    }
  }

  return new Response(JSON.stringify({ sent, failed, errors }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
