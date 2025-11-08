// app/api/video-olustur/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt } = body;
    const apiKey = process.env.GENAI_API_KEY;

    if (!apiKey || !prompt) {
      return NextResponse.json({ error: "API key veya prompt eksik" }, { status: 400 });
    }

    const baseUrl = "https://generativelanguage.googleapis.com/v1/models/veo-3.0-generate-001:generateContent";
    const url = `${baseUrl}?key=${apiKey}`;

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    };

    console.log("API URL:", url);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("API HATASI:", JSON.stringify(data, null, 2));
      return NextResponse.json(
        { error: "Video oluşturulamadı", details: data },
        { status: res.status }
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