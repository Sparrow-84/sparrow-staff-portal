import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ONESIGNAL_API = 'https://onesignal.com/api/v1/notifications';

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const appId = Deno.env.get('ONESIGNAL_LCP_APP_ID');
  const apiKey = Deno.env.get('ONESIGNAL_LCP_API_KEY');
  if (!appId || !apiKey) {
    return new Response(JSON.stringify({ sent: 0, reason: 'push not configured' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { title, body, url } = await req.json() as PushPayload;

  const { data } = await supabase
    .from('lcp_families')
    .select('id')
    .eq('push_enabled', true);

  const externalIds = (data ?? []).map((f: { id: string }) => f.id);

  if (externalIds.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

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

  const result = await res.json();
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
    status: res.ok ? 200 : 500,
  });
});
