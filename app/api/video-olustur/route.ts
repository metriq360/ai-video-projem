// app/api/video-olustur/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, aspectRatio = "16:9", duration = 8 } = body;
    const apiKey = process.env.GENAI_API_KEY;

    if (!apiKey || !prompt) {
      return NextResponse.json({ error: "Eksik" }, { status: 400 });
    }

    // QUERY PARAM OLARAK EKLE!
    const url = new URL(`https://generativelanguage.googleapis.com/v1/models/veo-3.0-generate-001:generateContent`);
    url.searchParams.append("key", apiKey);
    url.searchParams.append("video_aspect_ratio", aspectRatio);
    url.searchParams.append("video_duration_seconds", duration.toString());

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    };

    console.log("API URL:", url.toString());
    console.log("Payload:", JSON.stringify(requestBody, null, 2));

    const res = await fetch(url.toString(), {
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
      return NextResponse.json({ error: "Operation name yok", raw: data }, { status: 500 });
    }

    return NextResponse.json({ operationName });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}