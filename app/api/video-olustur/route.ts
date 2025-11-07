// app/api/video-olustur/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      prompt,
      apiKey: clientApiKey,
      aspectRatio = "16:9",
      duration = 8,
      base64Image,
    } = body;

    const apiKey = clientApiKey || process.env.GENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "API key eksik" }, { status: 400 });
    if (!prompt) return NextResponse.json({ error: "Prompt boş" }, { status: 400 });

    const url = `https://generativelanguage.googleapis.com/v1/models/veo-3.0-generate-preview:generateContent?key=${apiKey}`;

    const requestBody: any = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
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

    console.log("API URL:", url);
    console.log("Payload:", JSON.stringify(requestBody, null, 2));

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("API 400 HATASI:", data);
      return NextResponse.json(
        { error: "GenerateVideo API hata: 400", details: data },
        { status: 400 }
      );
    }

    const operationName = data?.name;
    if (!operationName) {
      console.error("Operation name yok:", data);
      return NextResponse.json({ error: "Operation name alınamadı", raw: data }, { status: 500 });
    }

    return NextResponse.json({ operationName });

  } catch (err: any) {
    console.error("POST error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}