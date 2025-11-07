// app/api/video-olustur/route.ts
import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_CANDIDATES = [
  // Denenecek endpoint varyasyonları (sıra önemli)
  "{MODEL}:generateVideo",            // örn: veo-3.1-fast-generate-preview:generateVideo
  "{MODEL}:generate",                 // örn: veo-3.1-generate-preview:generate
  "{MODEL}:predictLongRunning",       // bazen kullanılıyor
  "{MODEL}:predict",                  // fallback
];

const MAX_POLL_TIME = 10 * 60 * 1000;
const POLL_INTERVAL = 5_000;

function stripDataUrl(base64?: string | null) {
  if (!base64) return null;
  const idx = base64.indexOf(",");
  return idx >= 0 ? base64.slice(idx + 1) : base64;
}

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return { ok: true, json: JSON.parse(text) };
  } catch (e) {
    return { ok: false, text };
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch (e) {
      const txt = await req.text();
      console.error("Geçersiz JSON body:", txt.slice(0, 500));
      return NextResponse.json({ error: "İstek body'si geçerli JSON değil." }, { status: 400 });
    }

    const apiKey = body.apiKey || process.env.GENAI_API_KEY;
    const prompt = body.prompt;
    const aspectRatio = body.aspectRatio || "16:9";
    const base64Image = stripDataUrl(body.base64Image);

    if (!apiKey) return NextResponse.json({ error: "API anahtarı sağlanmadı." }, { status: 400 });
    if (!prompt) return NextResponse.json({ error: "prompt alanı boş." }, { status: 400 });

    // Denenecek URL dizisini hazırla (MODEL placeholder'ını body.model veya default ile değiştir)
    const modelName = body.model || "veo-3.1-fast-generate-preview";
    const endpoints = MODEL_CANDIDATES.map(p => `${API_BASE_URL}/models/${encodeURIComponent(modelName)}:${p.replace("{MODEL}:", "")}?key=${encodeURIComponent(apiKey)}`);

    // Payload: endpoint'e göre uyumlu hale getir (özelleştirebiliriz)
    const payload: any = {
      prompt: { text: prompt },
      videoConfig: { aspectRatio },
    };
    if (base64Image) payload.inputImage = { content: base64Image };

    let lastError: any = null;
    let genJson: any = null;
    let genResStatus: number | null = null;

    // 1) Try endpoints in order
    for (const url of endpoints) {
      console.log("Trying endpoint:", url);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      genResStatus = res.status;
      const parsed = await safeJson(res);
      if (!res.ok) {
        console.warn("Endpoint returned error:", url, res.status, parsed.ok ? parsed.json : parsed.text);
        lastError = { url, status: res.status, parsed };
        // If 404 specifically, try next endpoint
        if (res.status === 404) continue;
        // For non-404 we may still try next endpoints, but break only on certain codes if you want:
        // continue;
      } else {
        // Success-ish response: capture json and break
        genJson = parsed.ok ? parsed.json : null;
        console.log("Endpoint success:", url, "parsed.ok:", parsed.ok);
        // If the response indicates an operation (LRO) or direct videoFiles, break to handle below
        break;
      }
    }

    if (!genJson && lastError) {
      // No successful JSON response from any endpoint
      console.error("All endpoints failed. Last error:", lastError);
      // Return last raw body to help debugging (careful with sensitive data)
      return NextResponse.json({ error: `GenerateVideo API hata: ${lastError.status}`, raw: lastError.parsed?.ok ? lastError.parsed.json : lastError.parsed?.text }, { status: 502 });
    }

    // 2) If direct videoFiles exist in genJson, return immediately
    if (genJson?.videoFiles && Array.isArray(genJson.videoFiles) && genJson.videoFiles[0]?.uri) {
      return NextResponse.json({ videoUrl: genJson.videoFiles[0].uri });
    }

    // 3) If we received an operation name -> poll it
    const operationName =
      genJson?.name ||
      genJson?.operation?.name ||
      genJson?.operationName ||
      genJson?.operationId ||
      genJson?.result?.name;

    if (!operationName) {
      console.warn("No operation name found in response; full genJson:", JSON.stringify(genJson).slice(0,1000));
      return NextResponse.json({ error: "Generate yanıtı beklenen formata uymuyor.", raw: genJson }, { status: 502 });
    }

    const opUrl = `${API_BASE_URL}/operations/${encodeURIComponent(operationName)}?key=${encodeURIComponent(apiKey)}`;
    const start = Date.now();
    let operation: any = null;

    while (Date.now() - start < MAX_POLL_TIME) {
      const opRes = await fetch(opUrl);
      const opParsed = await safeJson(opRes);

      if (!opRes.ok) {
        const msg = opParsed.ok ? JSON.stringify(opParsed.json) : opParsed.text;
        throw new Error(`Operation fetch hata: ${opRes.status} - ${msg}`);
      }

      operation = opParsed.json;
      if (operation.done) break;

      console.log("Operation in progress...", operation?.metadata || "no metadata");
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
    }

    if (!operation || !operation.done) throw new Error("Video oluşturma zaman aşımı veya tamamlanmadı.");
    if (operation.error) throw new Error(`Video oluşturma hatası: ${operation.error?.message || JSON.stringify(operation.error)}`);

    // 4) Try to find a video URI in multiple places
    const candidates = [operation.response, operation.response?.result, genJson, genJson?.result, operation];
    let videoUri: string | null = null;
    for (const loc of candidates) {
      if (!loc) continue;
      if (Array.isArray(loc.videoFiles) && loc.videoFiles[0]?.uri) {
        videoUri = loc.videoFiles[0].uri; break;
      }
      if (loc?.mediaUris && Array.isArray(loc.mediaUris) && loc.mediaUris[0]) { videoUri = loc.mediaUris[0]; break; }
      if (loc?.outputUri) { videoUri = loc.outputUri; break; }
      if (loc?.uri) { videoUri = loc.uri; break; }
    }

    if (!videoUri) {
      console.error("Operation done but no video URI found. Operation:", JSON.stringify(operation).slice(0,2000));
      return NextResponse.json({ error: "Video URI bulunamadı. Logs kontrol et." }, { status: 502 });
    }

    return NextResponse.json({ videoUrl: videoUri });

  } catch (err: any) {
    console.error("Server error in /api/video-olustur:", err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
