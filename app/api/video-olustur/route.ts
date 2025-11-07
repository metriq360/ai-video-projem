// app/api/video-olustur/route.ts
// Temizlenmiş, hata-tolerant ve log-odaklı sürüm.
// Google VEO 3.1 veya benzeri video üretim API’leriyle uyumlu hale getirildi.

import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const VEO_MODEL = "veo-3.1-fast-generate-preview";
const MAX_POLL_TIME = 10 * 60 * 1000; // 10 dakika
const POLL_INTERVAL = 5000;

// 🧩 Base64 başlığını temizler (data:image/png;base64,... → sadece içerik)
function stripDataUrl(base64?: string | null) {
  if (!base64) return null;
  const idx = base64.indexOf(",");
  return idx >= 0 ? base64.slice(idx + 1) : base64;
}

// 🛡️ JSON parse güvenli
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
    // 1️⃣ Body güvenli parse
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

    if (!apiKey) {
      return NextResponse.json({ error: "API anahtarı sağlanmadı (apiKey veya GENAI_API_KEY)." }, { status: 400 });
    }
    if (!prompt) {
      return NextResponse.json({ error: "prompt alanı boş." }, { status: 400 });
    }

    // 2️⃣ Video oluşturma isteği (REST)
    const url = `${API_BASE_URL}/models/${encodeURIComponent(VEO_MODEL)}:generateVideo?key=${encodeURIComponent(apiKey)}`;

    const generatePayload: any = {
      prompt: { text: prompt },
      videoConfig: { aspectRatio },
    };

    if (base64Image) generatePayload.inputImage = { content: base64Image };

    console.log("🎬 VIDEO GENERATE →", { model: VEO_MODEL, aspectRatio, promptPreview: prompt.slice(0, 100) });

    const genRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(generatePayload),
    });

    const genParsed = await safeJson(genRes);

    if (!genRes.ok) {
      const message = genParsed.ok ? (genParsed.json?.error?.message || JSON.stringify(genParsed.json)) : genParsed.text;
      console.error("❌ GenerateVideo API hata:", genRes.status, message);
      return NextResponse.json({ error: `GenerateVideo API hata: ${genRes.status} - ${message}` }, { status: 502 });
    }

    const genJson = genParsed.json;

    // 3️⃣ Eğer doğrudan video URL geldiyse
    if (genJson?.videoFiles && Array.isArray(genJson.videoFiles) && genJson.videoFiles[0]?.uri) {
      console.log("✅ Doğrudan videoFiles döndü.");
      return NextResponse.json({ videoUrl: genJson.videoFiles[0].uri });
    }

    // 4️⃣ Long-running operation (polling)
    const operationName =
      genJson?.name ||
      genJson?.operation?.name ||
      genJson?.operationName ||
      genJson?.operationId;

    if (!operationName) {
      console.warn("⚠️ Operation name bulunamadı:", JSON.stringify(genJson).slice(0, 300));
      return NextResponse.json({ error: "Generate yanıtında operation veya videoFiles bulunamadı.", raw: genJson }, { status: 502 });
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

      console.log("⏳ Operation devam ediyor...", operation?.metadata || "metadata yok");
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    }

    if (!operation || !operation.done) {
      throw new Error("Video oluşturma işlemi zaman aşımına uğradı veya tamamlanamadı.");
    }

    if (operation.error) {
      throw new Error(`Video oluşturma hatası: ${operation.error?.message || JSON.stringify(operation.error)}`);
    }

    // 5️⃣ Video URI bul
    const possiblePaths = [
      operation.response,
      operation.response?.result,
      genJson,
      genJson?.result,
      operation,
    ];

    let videoUri: string | null = null;
    for (const loc of possiblePaths) {
      if (!loc) continue;
      if (Array.isArray(loc.videoFiles) && loc.videoFiles[0]?.uri) {
        videoUri = loc.videoFiles[0].uri;
        break;
      }
      if (loc.mediaUris && Array.isArray(loc.mediaUris)) {
        videoUri = loc.mediaUris[0];
        break;
      }
      if (loc.outputUri) {
        videoUri = loc.outputUri;
        break;
      }
      if (loc.uri) {
        videoUri = loc.uri;
        break;
      }
    }

    if (!videoUri) {
      console.error("🎥 Video oluşturuldu ama URI bulunamadı:", JSON.stringify(operation).slice(0, 500));
      return NextResponse.json({ error: "Video URI bulunamadı, logları kontrol et." }, { status: 502 });
    }

    console.log("✅ Video URL bulundu:", videoUri);
    return NextResponse.json({ videoUrl: videoUri });

  } catch (err: any) {
    console.error("💥 Sunucu hatası:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
