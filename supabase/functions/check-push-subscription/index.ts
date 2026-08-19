// Ground-truth check: does OneSignal actually have a live, enabled push
// subscription for the calling staff member -- as opposed to `profiles
// .push_enabled`, which is just a preference flag that defaults to true and
// can go stale (e.g. iOS silently drops a subscription after inactivity)
// without ever being corrected anywhere. The caller's identity comes from
// their own verified JWT, never a client-supplied id, so this can only ever
// report on your own subscription.
//
// Always resolves (200), never throws to the caller -- `subscribed: null`
// means "couldn't tell" (missing config, OneSignal error, network issue),
// and the client is expected to treat that as "do nothing," not "broken."
// The caller side deliberately only acts on an explicit `false`, to avoid a
// transient hiccup here ever incorrectly flipping someone's real, working
// subscription off.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const inconclusive = () =>
    new Response(JSON.stringify({ subscribed: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  const appId = Deno.env.get('ONESIGNAL_APP_ID');
  const apiKey = Deno.env.get('ONESIGNAL_API_KEY');
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

  // profiles.id IS the auth user id in this app (no separate mapping,
  // unlike LCP families) -- matches what loginOneSignal(profile.id) registers.
  const externalId = user.id;

  try {
    const res = await fetch(
      `https://onesignal.com/api/v1/apps/${appId}/users/by/external_id/${externalId}`,
      { headers: { Authorization: `Key ${apiKey}` } },
    );

    // 404 = OneSignal has never heard of this external_id -- a clear,
    // confident "not subscribed," not an error.
    if (res.status === 404) {
      return new Response(JSON.stringify({ subscribed: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!res.ok) return inconclusive();

    const result = await res.json();
    const subscriptions = (result.subscriptions ?? []) as Array<{ type: string; enabled: boolean }>;
    // Any real push-channel subscription (web/Safari/Chrome/etc, not Email/SMS)
    // that OneSignal itself marks enabled counts as "push actually works right now."
    const subscribed = subscriptions.some((s) => s.enabled && s.type !== 'Email' && s.type !== 'SMS');

    return new Response(JSON.stringify({ subscribed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return inconclusive();
  }
});
