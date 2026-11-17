import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Current OneSignal REST endpoint -- the one documented for "Authorization: Key ..." app
// API keys and include_aliases targeting.
const ONESIGNAL_API = 'https://api.onesignal.com/notifications?c=push';

// Called from the browser (a different origin than supabase.co), so every response needs
// CORS headers and the OPTIONS preflight must be answered -- otherwise the browser blocks
// the call before it reaches this code. See send-push for the full story.
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

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  const appId = Deno.env.get('ONESIGNAL_LCP_APP_ID');
  const apiKey = Deno.env.get('ONESIGNAL_LCP_API_KEY');
  if (!appId || !apiKey) return json({ sent: 0, reason: 'push not configured' });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // This messages every LCP family, so only signed-in STAFF may trigger it -- not the
  // public anon key, and not a family account.
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !userData?.user) return json({ error: 'Not authenticated' }, 401);
  const { data: staff } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userData.user.id)
    .eq('active', true)
    .maybeSingle();
  if (!staff) return json({ error: 'Only staff can send family notifications' }, 403);

  const { title, body, url } = await req.json() as PushPayload;

  const { data } = await supabase
    .from('families')
    .select('id')
    .eq('push_enabled', true);

  const externalIds = (data ?? []).map((f: { id: string }) => f.id);
  if (externalIds.length === 0) return json({ sent: 0 });

  const payload: Record<string, unknown> = {
    app_id: appId,
    target_channel: 'push',
    include_aliases: { external_id: externalIds },
    headings: { en: title },
    contents: { en: body },
  };
  if (url) payload.web_url = url;

  const res = await fetch(ONESIGNAL_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Key ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const result = await res.json().catch(() => ({}));
  return json(result, res.ok ? 200 : 500);
});
