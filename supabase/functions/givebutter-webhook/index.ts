import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Givebutter -> Sparrow CRM auto-sync (Design Session H).
// Inbound webhook from Givebutter, NOT a signed-in Sparrow user — auth is a
// signing secret, not a JWT, unlike every other function in this folder.
//
// TODO before going live (blocked on Bethany's Givebutter login):
//   1. Confirm the exact `Signature` header format/algorithm against a real
//      test webhook — Givebutter's docs describe a signing secret + a
//      `Signature` header but not the precise scheme. This implements the
//      common convention (HMAC-SHA256 hex digest of the raw body). Verify
//      against Settings -> Developers -> Webhooks once accessible, adjust
//      verifySignature() if Givebutter's actual scheme differs.
//   2. Confirm the exact `transaction.succeeded` payload field names against
//      a real test event (Givebutter's dashboard can send one). The field
//      names below are best-guess based on their public docs; adjust the
//      destructuring in handleTransactionSucceeded() to match.
//   3. Confirm whether `amount` arrives in cents or dollars.

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET    = Deno.env.get('GIVEBUTTER_WEBHOOK_SECRET')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, signature',
};

async function verifySignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  if (!signatureHeader) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const digestHex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return digestHex === signatureHeader;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const rawBody = await req.text();
  const signature = req.headers.get('signature') ?? req.headers.get('Signature');
  if (!(await verifySignature(rawBody, signature))) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const payload = JSON.parse(rawBody);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

  if (payload.event !== 'transaction.succeeded') {
    // Ack everything else (contact.created, plan.*, etc.) — only donations sync for now.
    return new Response(JSON.stringify({ ok: true, skipped: payload.event }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  try {
    await handleTransactionSucceeded(supabase, payload.data ?? {});
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleTransactionSucceeded(supabase: ReturnType<typeof createClient>, data: any) {
  const givebutterId: string     = String(data.id ?? data.transaction_id);
  const givenByName: string      = data.giver?.name ?? data.donor_name ?? 'Unknown donor';
  const givenByEmail: string | null = data.giver?.email ?? data.donor_email ?? null;
  const amount: number           = Number(data.amount ?? 0); // TODO: confirm dollars vs. cents
  const amountAbove10k           = amount >= 10_000;
  const receivedOn: string       = (data.created_at ?? new Date().toISOString()).slice(0, 10);
  const designation: string | null = data.campaign?.title ?? null;
  const recurring: boolean       = Boolean(data.recurring ?? data.plan_id);

  // 1. Upsert the donation row itself — retry-safe on givebutter_id (0044).
  const { data: donationRow, error: upsertErr } = await supabase
    .from('donations')
    .upsert(
      {
        givebutter_id: givebutterId,
        given_by_name: givenByName,
        given_by_email: givenByEmail,
        amount_above_10k: amountAbove10k,
        designation,
        giving_method: 'Givebutter',
        recurring,
        received_on: receivedOn,
      },
      { onConflict: 'givebutter_id' },
    )
    .select('id')
    .single();
  if (upsertErr) throw new Error(upsertErr.message);
  const donationId = donationRow.id as string;

  // 2. Exact email match — attach directly, no ambiguity.
  if (givenByEmail) {
    const { data: exact } = await supabase
      .from('partners')
      .select('id')
      .ilike('email', givenByEmail)
      .eq('active', true)
      .limit(1)
      .maybeSingle();
    if (exact) {
      await supabase.from('donations').update({ partner_id: exact.id }).eq('id', donationId);
      await supabase.rpc('attach_gift_to_partner', { p_partner_id: exact.id, p_amount_above_10k: amountAbove10k });
      return;
    }
  }

  // 3. No email match — check for a loose name match (see find_possible_donor_match, 0088).
  const { data: candidateId } = await supabase.rpc('find_possible_donor_match', { p_name: givenByName });
  if (candidateId) {
    // Ambiguous — hold for human review rather than guessing. Assign to the
    // candidate's own owner (who'd know the relationship) if set, else the
    // standing CRM owner.
    await supabase.from('donations').update({ possible_match_partner_id: candidateId }).eq('id', donationId);
    const { data: candidatePartner } = await supabase
      .from('partners')
      .select('name, owner_id')
      .eq('id', candidateId)
      .single();
    const { data: fallbackOwner } = await supabase.rpc('default_partnerships_owner');
    const assignee = candidatePartner?.owner_id ?? fallbackOwner;
    if (assignee) {
      const due = new Date();
      due.setDate(due.getDate() + 2);
      await supabase.rpc('emit_system_task', {
        p_system: 'crm',
        p_ref: `possible_duplicate_donor:${donationId}`,
        p_assignee: assignee,
        p_title: `Possible duplicate donor — confirm match: "${givenByName}" vs existing "${candidatePartner?.name ?? 'partner'}"`,
        p_department: 'partnerships',
        p_priority: 'p1',
        p_due: due.toLocaleDateString('en-CA'),
      });
    }
    return;
  }

  // 4. No match at all — genuinely new donor, safe to auto-create.
  const { data: newPartnerId } = await supabase.rpc('create_donor_partner_from_gift', {
    p_name: givenByName,
    p_email: givenByEmail,
    p_amount_above_10k: amountAbove10k,
    p_source: 'Givebutter',
  });
  await supabase.from('donations').update({ partner_id: newPartnerId }).eq('id', donationId);
}
