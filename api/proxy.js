export const config = {
  runtime: 'edge',
};

const SUPABASE_ORIGIN = 'https://dxoyyflsqrzgzjfihgcx.supabase.co';

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
    'Access-Control-Allow-Headers':
      req.headers.get('access-control-request-headers') ||
      'Authorization, apikey, Content-Type, Prefer, Range, x-client-info, Content-Profile, Accept-Profile, x-upsert',
    'Access-Control-Expose-Headers':
      'Content-Range, Range-Unit, Accept-Ranges, Content-Length, Content-Type, x-total-count',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const forwardPath = url.searchParams.get('path') || url.pathname;
    const searchParams = new URLSearchParams(url.searchParams);
    searchParams.delete('target');
    searchParams.delete('path');
    const queryStr = searchParams.toString();
    const targetUrl = `${SUPABASE_ORIGIN}${forwardPath}${queryStr ? '?' + queryStr : ''}`;

    const forwardHeaders = new Headers();
    const allowed = [
      'authorization',
      'apikey',
      'content-type',
      'prefer',
      'range',
      'x-client-info',
      'content-profile',
      'accept-profile',
      'x-upsert',
      'accept',
    ];
    for (const h of allowed) {
      const v = req.headers.get(h);
      if (v) forwardHeaders.set(h, v);
    }

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
      redirect: 'manual',
    });

    const respHeaders = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(corsHeaders)) {
      respHeaders.set(k, v);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Edge gateway error', message: err.message }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
