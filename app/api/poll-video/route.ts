// app/api/poll-video/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { operationName, apiKey: clientApiKey } = await req.json();
  const apiKey = clientApiKey || process.env.GENAI_API_KEY;
  if (!apiKey || !operationName) return NextResponse.json({ error: "Eksik" }, { status: 400 });

  const url = `https://generativelanguage.googleapis.com/v1/${operationName}?key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.done && data.response?.videoOutputs?.[0]?.video?.uri) {
    return NextResponse.json({ videoUrl: data.response.videoOutputs[0].video.uri });
  }

  return NextResponse.json({ status: "processing" });
}