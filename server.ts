import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { v2 as cloudinary } from "cloudinary";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

function extractPublicId(fileUrl: string) {
  // Example URL: https://res.cloudinary.com/di5kzqmrd/video/upload/v1700000000/some-file.mp4
  // We need to parse: return 'some-file'
  
  try {
    const urlParts = fileUrl.split('/');
    const uploadIndex = urlParts.indexOf('upload');
    if (uploadIndex === -1) return null;
    
    // The public ID is everything after the version folder (or directly after 'upload' if no version)
    // and without the file extension (unless it's raw)
    let publicIdPart = urlParts.slice(uploadIndex + 1).join('/');
    
    // Remove version folder if exists (e.g. 'v1234567890/')
    if (publicIdPart.match(/^v\d+\//)) {
        publicIdPart = publicIdPart.replace(/^v\d+\//, '');
    }
    
    // Remove extension unless it's a raw file type
    if (!fileUrl.includes('/raw/')) {
        const lastDotIndex = publicIdPart.lastIndexOf('.');
        if (lastDotIndex !== -1) {
            publicIdPart = publicIdPart.substring(0, lastDotIndex);
        }
    }
    
    return publicIdPart;
  } catch (e) {
    return null;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '200mb' }));
  app.use(express.urlencoded({ limit: '200mb', extended: true }));

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
      
      const newFileName = publicId.split('/').pop();
      const newPublicId = `deleted_files/${newFileName}`;
      
      let resourceType = 'image';
      if (fileUrl.includes('/video/')) {
        resourceType = 'video';
      } else if (fileUrl.includes('/raw/')) {
        resourceType = 'raw';
      }

      console.log(`Renaming ${publicId} to ${newPublicId} (type: ${resourceType})`);

      const result = await cloudinary.uploader.rename(publicId, newPublicId, {
        overwrite: true,
        invalidate: true,
        resource_type: resourceType as any
      });
      
      res.json({ success: true, result });
    } catch (error: any) {
      console.error("Cloudinary soft-delete error: ", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route for upload signature
  app.post("/api/cloudinary/sign", async (req, res) => {
    try {
      const timestamp = Math.round((new Date()).getTime() / 1000);
      const paramsToSign = {
        timestamp: timestamp
      };
      const signature = cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET!);
      res.json({ timestamp, signature, cloudName: process.env.CLOUDINARY_CLOUD_NAME, apiKey: process.env.CLOUDINARY_API_KEY });
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
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ inputs })
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

  // API Route for Transcribing (Bypasses region block AND avoids large base64 uploads)
  app.post("/api/transcribe", async (req, res) => {
    try {
      const { url, apiKey, aiProvider } = req.body;
      if (!url || !apiKey) {
         res.status(400).json({ error: "Missing url or apiKey" });
         return;
      }

      // Download file on server this bypasses client-side NGINX upload limits
      const fileRes = await fetch(url);
      if (!fileRes.ok) {
         res.status(500).json({ error: "Failed to download media on server" });
         return;
      }

      let mimeType = fileRes.headers.get("content-type") || 'audio/webm';
      if (mimeType.includes(';')) mimeType = mimeType.split(';')[0];
      // Normalize mimeType since some video codecs break the API
      if (mimeType.includes('video')) mimeType = 'audio/webm';

      const arrayBuffer = await fileRes.arrayBuffer();

      if (aiProvider === 'hf') {
          const hfRes = await fetch('https://api-inference.huggingface.co/models/openai/whisper-large-v3-turbo', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${apiKey}` },
              body: Buffer.from(arrayBuffer)
          });
          if (!hfRes.ok) {
              const text = await hfRes.text();
              res.status(hfRes.status).json({ error: text });
              return;
          }
          const data = await hfRes.json();
          if (data.error) throw new Error(data.error);
          res.json({ text: data.text });
          return;
      } else {
          // Default to Gemini
          const base64data = Buffer.from(arrayBuffer).toString('base64');
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
          
          const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                role: 'user',
                parts: [
                  { text: 'Transcribe this audio/video. Return only the transcription text in the language spoken. If there is no speech, return an empty string.' },
                  { inline_data: { mime_type: mimeType, data: base64data } }
                ]
              }]
            })
          });

          if (!geminiRes.ok) {
            const text = await geminiRes.text();
            res.status(geminiRes.status).json({ error: text });
            return;
          }
          const data = await geminiRes.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          res.json({ text });
      }
    } catch (e: any) {
      console.error("Transcribe proxy error:", e);
      res.status(500).json({ error: e.message });
    }
  });

    if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, Vite produces dist/client or just dist
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
