// app/api/video-olustur/route.ts
import { NextRequest, NextResponse } from "next/server";

const API_URL = "https://generativelanguage.googleapis.com/v1/models";
const MODEL_NAME = "veo-3.0-generate-preview"; // veya veo-3.1-generate-preview
const ENDPOINT = "generateContent";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, apiKey: clientApiKey, aspectRatio = "16:9", duration = 8, base64Image } = body;

    const apiKey = clientApiKey || process.env.GENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "API anahtarı eksik." }, { status: 400 });
    if (!prompt) return NextResponse.json({ error: "Prompt boş." }, { status: 400 });

    // Google Generative AI SDK kullanmıyoruz, doğrudan REST
    const url = `${API_URL}/${MODEL_NAME}:${ENDPOINT}?key=${apiKey}`;

    const requestBody: any = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        videoGenerationConfig: {
          durationSeconds: duration,
          aspectRatio,
        },
      },
    };

    if (base64Image) {
      const base64 = base64Image.replace(/^data:image\/[a-z]+;base64,/, "");
      requestBody.contents[0].parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: base64,
        },
      });
    }

    console.log("API'ye istek atılıyor:", url);
    console.log("Payload:", JSON.stringify(requestBody, null, 2).slice(0, 1000));

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("API Hatası:", res.status, data);
      return NextResponse.json(
        { error: `API Hatası: ${res.status}`, details: data },
        { status: 400 }
      );
    }

    // LRO döner: operation name
    const operationName = data?.name;
    if (!operationName) {
      console.error("Operation name yok:", data);
      return NextResponse.json({ error: "Operation name alınamadı.", raw: data }, { status: 500 });
    }

    return NextResponse.json({ operationName });

  } catch (err: any) {
    console.error("POST Hatası:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}