export const config = {
  runtime: 'edge',
  regions: ['arn1', 'fra1', 'lhr1', 'cdg1', 'iad1']
};

const SUPABASE_HOST = 'dxoyyflsqrzgzjfihgcx.supabase.co';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': '*',
  'Access-Control-Max-Age': '86400'
};

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export default async function handler(request) {
  const reqHeaders = request.headers.get('access-control-request-headers');
  const corsHeaders = { ...CORS_HEADERS };
  if (reqHeaders) {
    corsHeaders['Access-Control-Allow-Headers'] = reqHeaders;
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);

  if (url.pathname === '/__health' || url.pathname === '/health') {
    return new Response(JSON.stringify({ ok: true, edge: true, supabaseHost: SUPABASE_HOST, ts: Date.now() }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  }

  // Server-side Audio/Video Transcription endpoint (downloads audio in EU/US and calls Gemini in EU/US)
  if (url.pathname === '/api/transcribe' && request.method === 'POST') {
    try {
      const body = await request.json();
      const { audioUrl, rawUrl, apiKeys, msgType } = body;
      const keys = Array.isArray(apiKeys) ? apiKeys.filter(Boolean) : [];
      if (!audioUrl || keys.length === 0) {
        return new Response(JSON.stringify({ error: 'Missing audioUrl or apiKeys' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const toDirectCloudinary = (u) => {
        if (!u) return '';
        const idx = u.indexOf('/cloudinary/');
        if (idx !== -1) {
          return 'https://res.cloudinary.com/' + u.substring(idx + '/cloudinary/'.length);
        }
        return u;
      };

      const primaryFetchUrl = toDirectCloudinary(audioUrl);
      const fallbackFetchUrl = toDirectCloudinary(rawUrl || audioUrl);

      let mediaRes = await fetch(primaryFetchUrl);
      if (!mediaRes.ok && fallbackFetchUrl && fallbackFetchUrl !== primaryFetchUrl) {
        mediaRes = await fetch(fallbackFetchUrl);
      }
      if (!mediaRes.ok) {
        return new Response(JSON.stringify({ error: 'Audio fetch failed: ' + mediaRes.status }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const arrayBuf = await mediaRes.arrayBuffer();
      const base64Data = arrayBufferToBase64(arrayBuf);
      let mimeType = mediaRes.headers.get('content-type') || (primaryFetchUrl.endsWith('.mp3') ? 'audio/mp3' : 'audio/webm');
      if (mimeType.includes(';')) mimeType = mimeType.split(';')[0];
      if (mimeType === 'audio/mpeg' || primaryFetchUrl.endsWith('.mp3')) mimeType = 'audio/mp3';
      else if (msgType === 'voice' || msgType === 'video_circle' || mimeType.includes('video')) mimeType = 'audio/webm';

      let lastErr = 'All keys failed';
      for (const key of keys) {
        try {
          const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + encodeURIComponent(key);
          const gRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                role: 'user',
                parts: [
                  { text: 'Transcribe this audio accurately. Return ONLY the spoken text in its original language without quotes or extra commentary. If there is no speech, return an empty string.' },
                  { inlineData: { data: base64Data, mimeType } }
                ]
              }]
            })
          });
          const gData = await gRes.json();
          if (gRes.ok) {
            const text = gData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Нет речи';
            return new Response(JSON.stringify({ text }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          } else {
            lastErr = gData?.error?.message || ('HTTP ' + gRes.status);
          }
        } catch (e) {
          lastErr = e.message || String(e);
        }
      }

      return new Response(JSON.stringify({ error: lastErr }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err && err.message ? err.message : err) }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  let targetUrl;
  let targetHost;
  let isCloudinaryMedia = false;

  if (url.pathname.startsWith('/cloudinary/')) {
    targetHost = 'res.cloudinary.com';
    const restPath = url.pathname.substring('/cloudinary'.length);
    targetUrl = 'https://' + targetHost + restPath + url.search;
    isCloudinaryMedia = true;
  } else if (url.pathname.startsWith('/cloudinary-api/')) {
    targetHost = 'api.cloudinary.com';
    const restPath = url.pathname.substring('/cloudinary-api'.length);
    targetUrl = 'https://' + targetHost + restPath + url.search;
  } else if (url.pathname.startsWith('/gemini/')) {
    targetHost = 'generativelanguage.googleapis.com';
    const restPath = url.pathname.substring('/gemini'.length);
    targetUrl = 'https://' + targetHost + restPath + url.search;
  } else if (url.pathname.startsWith('/hf/')) {
    targetHost = 'router.huggingface.co';
    const restPath = url.pathname.substring('/hf'.length);
    targetUrl = 'https://' + targetHost + restPath + url.search;
  } else if (url.pathname.startsWith('/pollinations/')) {
    targetHost = 'image.pollinations.ai';
    const restPath = url.pathname.substring('/pollinations'.length);
    targetUrl = 'https://' + targetHost + restPath + url.search;
  } else {
    targetHost = SUPABASE_HOST;
    let cleanPath = url.pathname;
    if (cleanPath.startsWith('/api/supabase/')) {
      cleanPath = cleanPath.substring('/api/supabase'.length);
    } else if (cleanPath.startsWith('/proxy/supabase/')) {
      cleanPath = cleanPath.substring('/proxy/supabase'.length);
    }
    targetUrl = 'https://' + targetHost + cleanPath + url.search;
  }

  const outHeaders = new Headers();
  for (const [k, v] of request.headers.entries()) {
    const lower = k.toLowerCase();
    if (
      lower === 'host' ||
      lower === 'origin' ||
      lower === 'referer' ||
      lower.startsWith('x-vercel') ||
      lower.startsWith('x-forwarded') ||
      lower.startsWith('cf-')
    ) {
      continue;
    }
    outHeaders.set(k, v);
  }

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: request.method,
      headers: outHeaders,
      body: hasBody ? request.body : undefined,
      redirect: 'manual'
    });

    const resHeaders = new Headers(upstreamRes.headers);
    for (const [k, v] of Object.entries(corsHeaders)) {
      resHeaders.set(k, v);
    }
    resHeaders.delete('content-security-policy');
    resHeaders.delete('x-frame-options');

    if (isCloudinaryMedia && upstreamRes.status >= 200 && upstreamRes.status < 300) {
      resHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: resHeaders
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Edge gateway error', message: String(err && err.message ? err.message : err) }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
