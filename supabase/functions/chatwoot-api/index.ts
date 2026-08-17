const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { config, endpoint, method, body } = payload;

    if (!config?.baseUrl || !config?.token || !config?.accountId) {
      return new Response(
        JSON.stringify({ error: 'Missing Chatwoot config (baseUrl, token, accountId)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!endpoint) {
      return new Response(
        JSON.stringify({ error: 'Missing endpoint' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const baseUrl = config.baseUrl.replace(/\/+$/, '');
    const url = `${baseUrl}/api/v1/accounts/${config.accountId}${endpoint}`;

    const fetchOpts: RequestInit = {
      method: method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'api_access_token': config.token,
      },
    };

    if (body && method !== 'GET') {
      fetchOpts.body = JSON.stringify(body);
    }

    const upstream = await fetch(url, fetchOpts);
    const text = await upstream.text();

    return new Response(text, {
      status: upstream.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal proxy error';
    console.error('[chatwoot-api] error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
