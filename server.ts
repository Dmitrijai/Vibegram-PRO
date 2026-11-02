import express from "express";
import http from "http";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { Readable } from "stream";
import { v2 as cloudinary } from "cloudinary";
import { WebSocketServer, WebSocket } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FALLBACK_SUPABASE_REF = "dxoyyflsqrzgzjfihgcx";

function resolveUpstreamSupabaseRef(): string {
  const candidates = [
    process.env.SUPABASE_ANON_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
  ];
  for (const token of candidates) {
    if (!token || !token.includes(".")) continue;
    try {
      const payloadPart = token.split(".")[1];
      const decoded = JSON.parse(Buffer.from(payloadPart, "base64").toString("utf8"));
      if (decoded && typeof decoded.ref === "string" && decoded.ref.length > 5) {
        return decoded.ref;
      }
    } catch {
      // Ignore malformed JWT
    }
  }
  const envUrl = process.env.SUPABASE_URL || "";
  const match = envUrl.match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  if (match && match[1]) {
    return match[1];
  }
  return FALLBACK_SUPABASE_REF;
}

const SUPABASE_REF = resolveUpstreamSupabaseRef();
const SUPABASE_ORIGIN = `https://${SUPABASE_REF}.supabase.co`;
const SUPABASE_WS_ORIGIN = `wss://${SUPABASE_REF}.supabase.co`;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "di5kzqmrd",
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function extractPublicId(fileUrl: string): string | null {
  try {
    const urlParts = fileUrl.split("/");
    const uploadIndex = urlParts.indexOf("upload");
    if (uploadIndex === -1) return null;

    let publicIdPart = urlParts.slice(uploadIndex + 1).join("/");
    if (publicIdPart.match(/^v\d+\//)) {
      publicIdPart = publicIdPart.replace(/^v\d+\//, "");
    }
    if (!fileUrl.includes("/raw/")) {
      const lastDotIndex = publicIdPart.lastIndexOf(".");
      if (lastDotIndex !== -1) {
        publicIdPart = publicIdPart.substring(0, lastDotIndex);
      }
    }
    return publicIdPart;
  } catch {
    return null;
  }
}

function setCorsHeaders(req: express.Request, res: express.Response) {
  const origin = req.headers.origin;
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD");
  res.setHeader(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] ||
      "Authorization, apikey, Content-Type, Prefer, Range, x-client-info, Content-Profile, Accept-Profile, x-upsert, cache-control, pragma"
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Content-Range, Range-Unit, Accept-Ranges, Content-Length, Content-Type, x-total-count"
  );
}

async function proxySupabaseHttp(req: express.Request, res: express.Response, targetPathAndQuery: string) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    const targetUrl = `${SUPABASE_ORIGIN}${targetPathAndQuery}`;
    const forwardHeaders: Record<string, string> = {};
    const allowedHeaders = [
      "authorization",
      "apikey",
      "content-type",
      "prefer",
      "range",
      "x-client-info",
      "content-profile",
      "accept-profile",
      "x-upsert",
      "accept",
    ];

    for (const h of allowedHeaders) {
      const val = req.headers[h];
      if (typeof val === "string") {
        forwardHeaders[h] = val;
      }
    }

    const hasBody =
      !["GET", "HEAD"].includes(req.method) &&
      req.body &&
      (Buffer.isBuffer(req.body) ? req.body.length > 0 : true);

    const upstreamRes = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: hasBody ? req.body : undefined,
      redirect: "manual",
    });

    res.status(upstreamRes.status);
    upstreamRes.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (
        ![
          "content-encoding",
          "transfer-encoding",
          "connection",
          "access-control-allow-origin",
          "access-control-allow-credentials",
          "access-control-allow-headers",
          "access-control-allow-methods",
          "access-control-expose-headers",
        ].includes(lower)
      ) {
        res.setHeader(key, value);
      }
    });

    const arrayBuffer = await upstreamRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    console.error("Supabase proxy error:", err.message || err);
    res.status(502).json({ error: "Gateway proxy error", details: err.message });
  }
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = Number(process.env.PORT || 3000);

  // Global CORS preflight support for all gateway routes
  app.use((req, res, next) => {
    setCorsHeaders(req, res);
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  // Fast health & latency probe endpoint
  const healthHandler = (_req: express.Request, res: express.Response) => {
    res.status(200).json({
      ok: true,
      gateway: "vibegram-shield-node",
      supabaseRef: SUPABASE_REF,
      ts: Date.now(),
    });
  };
  app.get("/health", healthHandler);
  app.get("/api/health", healthHandler);

  // 1. Supabase Reverse Proxy Routes (/rest/v1/*, /auth/v1/*, /storage/v1/*, /functions/v1/*, /api/supabase/*, /proxy/supabase/*)
  const rawBodyParser = express.raw({ type: "*/*", limit: "50mb" });

  app.use(["/rest/v1", "/auth/v1", "/storage/v1", "/functions/v1"], rawBodyParser, async (req, res) => {
    await proxySupabaseHttp(req, res, req.originalUrl);
  });

  app.use("/api/supabase", rawBodyParser, async (req, res) => {
    const stripped = req.originalUrl.replace(/^\/api\/supabase/, "") || "/";
    await proxySupabaseHttp(req, res, stripped);
  });

  app.use("/proxy/supabase", rawBodyParser, async (req, res) => {
    const stripped = req.originalUrl.replace(/^\/proxy\/supabase/, "") || "/";
    await proxySupabaseHttp(req, res, stripped);
  });

  // 2. Cloudinary Media Streaming Proxy with full Range (206 Partial Content) support for video/audio scrubbing
  app.use("/cloudinary", async (req, res) => {
    setCorsHeaders(req, res);
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    try {
      const subPath = req.originalUrl.replace(/^\/cloudinary/, "");
      const targetUrl = `https://res.cloudinary.com${subPath}`;
      const forwardHeaders: Record<string, string> = {};

      if (typeof req.headers.range === "string") {
        forwardHeaders["Range"] = req.headers.range;
      }
      if (typeof req.headers.accept === "string") {
        forwardHeaders["Accept"] = req.headers.accept;
      }
      if (typeof req.headers["if-none-match"] === "string") {
        forwardHeaders["If-None-Match"] = req.headers["if-none-match"];
      }
      if (typeof req.headers["if-modified-since"] === "string") {
        forwardHeaders["If-Modified-Since"] = req.headers["if-modified-since"];
      }

      const upstreamRes = await fetch(targetUrl, {
        method: req.method,
        headers: forwardHeaders,
      });

      res.status(upstreamRes.status);
      const passHeaders = [
        "content-type",
        "content-length",
        "content-range",
        "accept-ranges",
        "etag",
        "last-modified",
      ];
      for (const h of passHeaders) {
        const val = upstreamRes.headers.get(h);
        if (val) {
          res.setHeader(h, val);
        }
      }
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

      if (!upstreamRes.body || req.method === "HEAD") {
        res.end();
        return;
      }

      const nodeStream = Readable.fromWeb(upstreamRes.body as any);
      nodeStream.on("error", () => {
        if (!res.headersSent) res.status(502).end();
        else res.end();
      });
      req.on("close", () => {
        nodeStream.destroy();
      });
      nodeStream.pipe(res);
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(502).json({ error: "Cloudinary media proxy error", details: err.message });
      }
    }
  });

  // 3. Cloudinary Upload / Destroy API Proxy (/cloudinary-api/* -> https://api.cloudinary.com/*)
  app.use("/cloudinary-api", rawBodyParser, async (req, res) => {
    setCorsHeaders(req, res);
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    try {
      const subPath = req.originalUrl.replace(/^\/cloudinary-api/, "");
      const targetUrl = `https://api.cloudinary.com${subPath}`;
      const forwardHeaders: Record<string, string> = {};
      if (typeof req.headers["content-type"] === "string") {
        forwardHeaders["content-type"] = req.headers["content-type"];
      }
      if (typeof req.headers["authorization"] === "string") {
        forwardHeaders["authorization"] = req.headers["authorization"];
      }

      const hasBody =
        !["GET", "HEAD"].includes(req.method) &&
        req.body &&
        (Buffer.isBuffer(req.body) ? req.body.length > 0 : true);

      const upstreamRes = await fetch(targetUrl, {
        method: req.method,
        headers: forwardHeaders,
        body: hasBody ? req.body : undefined,
      });

      res.status(upstreamRes.status);
      const ct = upstreamRes.headers.get("content-type");
      if (ct) res.setHeader("Content-Type", ct);

      const buf = Buffer.from(await upstreamRes.arrayBuffer());
      res.send(buf);
    } catch (err: any) {
      res.status(502).json({ error: "Cloudinary API proxy error", details: err.message });
    }
  });

  // 4. Gemini AI, HuggingFace & Pollinations Proxies (/gemini/*, /hf/*, /pollinations/*)
  app.use("/gemini", rawBodyParser, async (req, res) => {
    setCorsHeaders(req, res);
    try {
      const subPath = req.originalUrl.replace(/^\/gemini/, "");
      const targetUrl = `https://generativelanguage.googleapis.com${subPath}`;
      const forwardHeaders: Record<string, string> = {};
      if (typeof req.headers["content-type"] === "string") {
        forwardHeaders["content-type"] = req.headers["content-type"];
      }
      if (typeof req.headers["x-goog-api-key"] === "string") {
        forwardHeaders["x-goog-api-key"] = req.headers["x-goog-api-key"];
      }

      const hasBody =
        !["GET", "HEAD"].includes(req.method) &&
        req.body &&
        (Buffer.isBuffer(req.body) ? req.body.length > 0 : true);

      const upstreamRes = await fetch(targetUrl, {
        method: req.method,
        headers: forwardHeaders,
        body: hasBody ? req.body : undefined,
      });

      res.status(upstreamRes.status);
      const ct = upstreamRes.headers.get("content-type");
      if (ct) res.setHeader("Content-Type", ct);
      res.send(Buffer.from(await upstreamRes.arrayBuffer()));
    } catch (err: any) {
      res.status(502).json({ error: "Gemini proxy error", details: err.message });
    }
  });

  app.use("/hf", rawBodyParser, async (req, res) => {
    setCorsHeaders(req, res);
    try {
      const subPath = req.originalUrl.replace(/^\/hf/, "");
      const targetUrl = `https://router.huggingface.co${subPath}`;
      const forwardHeaders: Record<string, string> = {};
      if (typeof req.headers["content-type"] === "string") {
        forwardHeaders["content-type"] = req.headers["content-type"];
      }
      if (typeof req.headers["authorization"] === "string") {
        forwardHeaders["authorization"] = req.headers["authorization"];
      }

      const hasBody =
        !["GET", "HEAD"].includes(req.method) &&
        req.body &&
        (Buffer.isBuffer(req.body) ? req.body.length > 0 : true);

      const upstreamRes = await fetch(targetUrl, {
        method: req.method,
        headers: forwardHeaders,
        body: hasBody ? req.body : undefined,
      });

      res.status(upstreamRes.status);
      const ct = upstreamRes.headers.get("content-type");
      if (ct) res.setHeader("Content-Type", ct);
      res.send(Buffer.from(await upstreamRes.arrayBuffer()));
    } catch (err: any) {
      res.status(502).json({ error: "HF proxy error", details: err.message });
    }
  });

  app.use("/pollinations", async (req, res) => {
    setCorsHeaders(req, res);
    try {
      const subPath = req.originalUrl.replace(/^\/pollinations/, "");
      const targetUrl = `https://image.pollinations.ai${subPath}`;
      const upstreamRes = await fetch(targetUrl);
      res.status(upstreamRes.status);
      const ct = upstreamRes.headers.get("content-type");
      if (ct) res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.send(Buffer.from(await upstreamRes.arrayBuffer()));
    } catch (err: any) {
      res.status(502).json({ error: "Pollinations proxy error", details: err.message });
    }
  });

  app.use(express.json({ limit: "15mb" }));

  // API Route for soft-delete
  app.post("/api/cloudinary/soft-delete", async (req, res) => {
    try {
      const { fileUrl } = req.body;
      if (!fileUrl) {
        res.status(400).json({ error: "Missing fileUrl" });
        return;
      }

      const publicId = extractPublicId(fileUrl);
      if (!publicId) {
        res.status(400).json({ error: "Could not extract public ID" });
        return;
      }

      const newFileName = publicId.split("/").pop();
      const newPublicId = `deleted_files/${newFileName}`;

      let resourceType = "image";
      if (fileUrl.includes("/video/")) {
        resourceType = "video";
      } else if (fileUrl.includes("/raw/")) {
        resourceType = "raw";
      }

      const result = await cloudinary.uploader.rename(publicId, newPublicId, {
        overwrite: true,
        invalidate: true,
        resource_type: resourceType as any,
      });

      res.json({ success: true, result });
    } catch (error: any) {
      console.error("Cloudinary soft-delete error: ", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route for upload signature
  app.post("/api/cloudinary/sign", async (_req, res) => {
    try {
      const timestamp = Math.round(new Date().getTime() / 1000);
      const paramsToSign = { timestamp };
      const signature = cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET!);
      res.json({
        timestamp,
        signature,
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
      });
    } catch (error: any) {
      console.error("Cloudinary sign error: ", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route for HF proxy
  app.post("/api/hf-proxy", async (req, res) => {
    try {
      const { url, apiKey, inputs } = req.body;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs }),
      });

      if (!response.ok) {
        const errText = await response.text();
        res.status(response.status).send(errText);
        return;
      }

      const arrayBuffer = await response.arrayBuffer();
      res.setHeader("Content-Type", response.headers.get("Content-Type") || "image/jpeg");
      res.send(Buffer.from(arrayBuffer));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Server-side Audio/Video Transcription endpoint (downloads compact 16kHz mono MP3 and calls Gemini 2.5 Flash with thinkingBudget: 0)
  app.post("/api/transcribe", async (req, res) => {
    try {
      const { audioUrl, rawUrl, audioBase64, mimeType: clientMime, apiKeys, msgType } = req.body || {};
      const keys: string[] = Array.isArray(apiKeys) ? apiKeys.filter(Boolean) : [];
      if ((!audioUrl && !audioBase64) || keys.length === 0) {
        res.status(400).json({ error: "Missing audio source or apiKeys" });
        return;
      }

      let base64Data = audioBase64 || "";
      let mimeType = clientMime || "audio/mp3";

      if (!base64Data) {
        const toDirectCloudinary = (u: string) => {
          if (!u) return "";
          const idx = u.indexOf("/cloudinary/");
          if (idx !== -1) {
            return "https://res.cloudinary.com/" + u.substring(idx + "/cloudinary/".length);
          }
          return u;
        };

        const toCompactMp3Cloudinary = (u: string) => {
          const direct = toDirectCloudinary(u);
          const m = direct.match(/^(https?:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(?:[^/]+\/)?(v\d+\/.+?)(\.[a-zA-Z0-9]+)?(\?.*)?$/);
          if (m) {
            return `${m[1]}f_mp3,br_32k,ac_1,ar_16000/${m[2]}.mp3`;
          }
          return direct;
        };

        const primaryFetchUrl = toCompactMp3Cloudinary(rawUrl || audioUrl);
        const secondaryFetchUrl = toDirectCloudinary(audioUrl);
        const fallbackFetchUrl = toDirectCloudinary(rawUrl || audioUrl);

        let mediaRes = await fetch(primaryFetchUrl);
        if (!mediaRes.ok && secondaryFetchUrl && secondaryFetchUrl !== primaryFetchUrl) {
          mediaRes = await fetch(secondaryFetchUrl);
        }
        if (!mediaRes.ok && fallbackFetchUrl && fallbackFetchUrl !== secondaryFetchUrl) {
          mediaRes = await fetch(fallbackFetchUrl);
        }
        if (!mediaRes.ok) {
          res.status(502).json({ error: "Audio fetch failed: " + mediaRes.status });
          return;
        }

        const arrayBuf = await mediaRes.arrayBuffer();
        base64Data = Buffer.from(arrayBuf).toString("base64");
        const ct = mediaRes.headers.get("content-type") || "";
        if (ct.includes("mpeg") || ct.includes("mp3") || (mediaRes.url && mediaRes.url.endsWith(".mp3"))) {
          mimeType = "audio/mp3";
        } else if (ct.includes("ogg")) {
          mimeType = "audio/ogg";
        } else if (ct.includes("mp4") || ct.includes("m4a")) {
          mimeType = "audio/mp4";
        } else if (msgType === "voice" || msgType === "video_circle" || ct.includes("webm") || ct.includes("video")) {
          mimeType = "audio/webm";
        } else {
          mimeType = ct.split(";")[0] || "audio/mp3";
        }
      }

      const callGeminiWithKey = async (key: string) => {
        const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(key);
        const gRes = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [
                { text: "Transcribe this audio accurately. Return ONLY the spoken text in its original language without quotes or extra commentary. If there is no speech, return an empty string." },
                { inlineData: { data: base64Data, mimeType } }
              ]
            }],
            generationConfig: {
              temperature: 0.1,
              thinkingConfig: { thinkingBudget: 0 }
            }
          })
        });
        const gData: any = await gRes.json();
        if (!gRes.ok) {
          throw new Error(gData?.error?.message || ("HTTP " + gRes.status));
        }
        return gData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "Нет речи";
      };

      let lastErr = "All keys failed";
      for (let i = 0; i < keys.length; i += 2) {
        const batch = keys.slice(i, i + 2);
        try {
          const text = await Promise.any(batch.map(k => callGeminiWithKey(k)));
          res.status(200).json({ text });
          return;
        } catch (aggErr: any) {
          const errs = aggErr?.errors || [aggErr];
          lastErr = errs.map((e: any) => e?.message || String(e)).join("; ");
        }
      }

      res.status(500).json({ error: lastErr });
    } catch (e: any) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // WebSocket Reverse Proxy for Supabase Realtime (/realtime/v1/websocket)
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const reqUrl = req.url || "";
    if (
      reqUrl.startsWith("/realtime/v1") ||
      reqUrl.startsWith("/api/supabase/realtime/v1") ||
      reqUrl.startsWith("/proxy/supabase/realtime/v1")
    ) {
      const cleanRealtimePath = reqUrl
        .replace(/^\/api\/supabase/, "")
        .replace(/^\/proxy\/supabase/, "");
      const upstreamWsUrl = `${SUPABASE_WS_ORIGIN}${cleanRealtimePath}`;

      wss.handleUpgrade(req, socket, head, (clientWs) => {
        const pendingMessages: { data: any; isBinary: boolean }[] = [];
        const upstreamWs = new WebSocket(upstreamWsUrl, {
          headers: {
            Origin: SUPABASE_ORIGIN,
            "User-Agent": req.headers["user-agent"] || "Vibegram-Realtime-Proxy/1.0",
          },
        });

        upstreamWs.on("open", () => {
          while (pendingMessages.length > 0) {
            const msg = pendingMessages.shift()!;
            if (upstreamWs.readyState === WebSocket.OPEN) {
              upstreamWs.send(msg.data, { binary: msg.isBinary });
            }
          }
        });

        upstreamWs.on("message", (data, isBinary) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(data, { binary: isBinary });
          }
        });

        upstreamWs.on("close", (code, reason) => {
          if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
            const safeCode = code >= 1000 && code <= 4999 && code !== 1005 && code !== 1006 ? code : 1000;
            clientWs.close(safeCode, reason);
          }
        });

        upstreamWs.on("error", () => {
          if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
            clientWs.close(1011, "Upstream WS Error");
          }
        });

        clientWs.on("message", (data, isBinary) => {
          if (upstreamWs.readyState === WebSocket.OPEN) {
            upstreamWs.send(data, { binary: isBinary });
          } else if (upstreamWs.readyState === WebSocket.CONNECTING) {
            pendingMessages.push({ data, isBinary });
          }
        });

        clientWs.on("close", (code, reason) => {
          if (upstreamWs.readyState === WebSocket.OPEN || upstreamWs.readyState === WebSocket.CONNECTING) {
            const safeCode = code >= 1000 && code <= 4999 && code !== 1005 && code !== 1006 ? code : 1000;
            upstreamWs.close(safeCode, reason);
          }
        });

        clientWs.on("error", () => {
          if (upstreamWs.readyState === WebSocket.OPEN || upstreamWs.readyState === WebSocket.CONNECTING) {
            upstreamWs.close(1000);
          }
        });
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Vibegram PRO Server & Anti-Block Gateway running on http://0.0.0.0:${PORT} -> ${SUPABASE_ORIGIN}`);
  });
}

startServer();
