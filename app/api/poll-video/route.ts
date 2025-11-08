// app/api/poll-video/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const operationName = searchParams.get("operationName");
  const apiKey = process.env.GENAI_API_KEY;

  if (!operationName || !apiKey) {
    return NextResponse.json(
      { error: "operationName veya GENAI_API_KEY eksik" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1/${operationName}?key=${apiKey}`
    );

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      console.error("Poll API Hatası:", errorData);
      return NextResponse.json(
        { error: "Poll işlemi başarısız", details: errorData },
        { status: res.status }
      );
    }

    const data = await res.json();

    if (data.done) {
      // VEO3 video URL'sini bu şekilde döner
      const videoUrl = data.response?.video?.uri || null;
      return NextResponse.json({ done: true, videoUrl });
    } else {
      // Henüz tamamlanmadı
      return NextResponse.json({ done: false, metadata: data.metadata });
    }
  } catch (err: any) {
    console.error("Poll route hatası:", err);
    return NextResponse.json(
      { error: "Sunucu hatası", message: err.message },
      { status: 500 }
    );
  }
}