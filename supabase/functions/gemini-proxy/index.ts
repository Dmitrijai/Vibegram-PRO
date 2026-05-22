// To deploy this function:
// supabase functions deploy gemini-proxy --no-verify-jwt

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-goog-api-key, x-goog-api-client',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    // Extract everything after /gemini-proxy
    const pathPart = url.pathname.split('/gemini-proxy')[1] || url.pathname;
    
    const targetUrl = `https://generativelanguage.googleapis.com${pathPart}`
    console.log("Proxying to:", targetUrl)

    const headers = new Headers();
    headers.set('Content-Type', req.headers.get('Content-Type') || 'application/json');
    if (req.headers.has('x-goog-api-key')) headers.set('x-goog-api-key', req.headers.get('x-goog-api-key')!);
    if (req.headers.has('x-goog-api-client')) headers.set('x-goog-api-client', req.headers.get('x-goog-api-client')!);

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.method === 'POST' ? await req.text() : undefined,
    });

    const responseHeaders = new Headers(corsHeaders);
    if (response.headers.has('content-type')) {
       responseHeaders.set('content-type', response.headers.get('content-type')!);
    }
    
    return new Response(response.body, {
       status: response.status,
       headers: responseHeaders
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
