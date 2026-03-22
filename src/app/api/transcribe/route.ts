import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "no Deepgram API key" }, { status: 500 });
  }

  const contentType = req.headers.get("content-type") || "audio/webm";
  const audioBuffer = await req.arrayBuffer();

  if (!audioBuffer.byteLength) {
    return NextResponse.json({ error: "empty audio" }, { status: 400 });
  }

  try {
    const res = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": contentType,
        },
        body: audioBuffer,
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("Deepgram API error:", res.status, errText);
      return NextResponse.json({ error: "Deepgram error" }, { status: 502 });
    }

    const data = await res.json();
    const transcript =
      data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";

    return NextResponse.json({ transcript });
  } catch (err) {
    console.error("Transcribe failed:", err);
    return NextResponse.json({ error: "Transcribe failed" }, { status: 500 });
  }
}
