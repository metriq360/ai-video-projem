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
    } = body;

    const apiKey = clientApiKey || process.env.GENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "API key eksik" }, { status: 400 });
    if (!prompt) return NextResponse.json({ error: "Prompt boş" }, { status: 400 });

    // DOĞRU MODEL ADI
    const url = `https://generativelanguage.googleapis.com/v1/models/veo-3.0-generate-001:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        video: {
          aspectRatio,
          durationSeconds: duration,
        },
      },
    };

    console.log("API URL:", url);
    console.log("Payload:", JSON.stringify(requestBody, null, 2));

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("API HATASI:", JSON.stringify(data, null, 2));
      return NextResponse.json(
        { error: "GenerateVideo API hata", details: data },
        { status: 400 }
      );
    }

    const operationName = data?.name;
    if (!operationName) {
      return NextResponse.json({ error: "Operation name alınamadı", raw: data }, { status: 500 });
    }

    return NextResponse.json({ operationName });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}