// LCP counterpart to check-push-subscription -- see that file's header for
// the full rationale. One difference: the OneSignal external_id for a family
// is families.id (see send-push-lcp), not the Supabase auth user id, so the
// caller's auth_id has to be resolved to their family row first, same
// lookup set_my_family_push_enabled() already uses.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const inconclusive = () =>
    new Response(JSON.stringify({ subscribed: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  const appId = Deno.env.get('ONESIGNAL_LCP_APP_ID');
  const apiKey = Deno.env.get('ONESIGNAL_LCP_API_KEY');
  if (!appId || !apiKey) return inconclusive();

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return inconclusive();

  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await callerClient.auth.getUser();
  if (authErr || !user) return inconclusive();

  const { data: family } = await callerClient
    .from('families')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle();
  if (!family) return inconclusive();

  const externalId = family.id as string;

  try {
    const res = await fetch(
      `https://onesignal.com/api/v1/apps/${appId}/users/by/external_id/${externalId}`,
      { headers: { Authorization: `Key ${apiKey}` } },
    );

    if (res.status === 404) {
      return new Response(JSON.stringify({ subscribed: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!res.ok) return inconclusive();

    const result = await res.json();
    const subscriptions = (result.subscriptions ?? []) as Array<{ type: string; enabled: boolean }>;
    const subscribed = subscriptions.some((s) => s.enabled && s.type !== 'Email' && s.type !== 'SMS');

    return new Response(JSON.stringify({ subscribed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return inconclusive();
  }
});
