import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Brevo -> Sparrow CRM auto-sync (Pending Decision from wasp-nest, greenlit 2026-09-12).
// Inbound webhook from Brevo, NOT a signed-in Sparrow user — auth is a shared secret sent
// as a custom header (Brevo webhooks support adding custom headers when you configure the
// webhook URL in their dashboard), the same "direct secret comparison" pattern already used
// by supabase/functions/givebutter-webhook — Brevo doesn't HMAC-sign these by default.
//
// NOT YET VERIFIED against a real test payload — same caution that applied to the
// Givebutter build (see that function's own comments): Brevo's documented webhook shape for
// a contact "unsubscribe" event is assumed to be a top-level `event` + `email` field, but
// the exact field names should be confirmed against a real test event sent from Brevo's own
// dashboard before trusting this in production. If a real test 400s or silently no-ops,
// that's the first thing to check — log the raw payload and compare.

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET   = Deno.env.get('BREVO_WEBHOOK_SECRET')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-webhook-secret',
};

function verifySecret(secretHeader: string | null): boolean {
  return secretHeader === WEBHOOK_SECRET;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const secret = req.headers.get('x-webhook-secret');
  if (!verifySecret(secret)) {
    return new Response(JSON.stringify({ error: 'Invalid secret' }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const payload = await req.json();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

  // Only the unsubscribe event syncs today — ack everything else (delivered, opened,
  // click, hardBounce, etc.) so Brevo doesn't treat unhandled events as failures/retries.
  if (payload.event !== 'unsubscribe') {
    return new Response(JSON.stringify({ ok: true, skipped: payload.event }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const email: string | undefined = payload.email;
  if (!email) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no email on payload' }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const nowIso = new Date().toISOString();
    // Exact email match only — mirrors the Givebutter sync's own "no fuzzy matching, don't
    // guess" rule. A partner not found by exact email means there's nothing in the CRM to
    // update; this isn't an error, just a no-op (e.g. someone who subscribed but was never
    // added as a partner record).
    const { data: partner, error: findErr } = await supabase
      .from('partners')
      .select('id')
      .ilike('email', email)
      .eq('active', true)
      .limit(1)
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);

    if (partner) {
      const { error: updateErr } = await supabase
        .from('partners')
        .update({ newsletter_subscribed: false, newsletter_unsubscribed_at: nowIso })
        .eq('id', partner.id);
      if (updateErr) throw new Error(updateErr.message);
    }

    return new Response(JSON.stringify({ ok: true, matched: Boolean(partner) }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
