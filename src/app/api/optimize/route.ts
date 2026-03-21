import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { query } = await req.json();

  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Fall back to original query if no key
    return NextResponse.json({ searchQuery: query });
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text: "You are a YouTube Shorts search query optimizer. Given a user's request, output the single best YouTube search query to find relevant short-form videos. Output ONLY the search query text, nothing else. Keep it concise (3-6 words). Optimize for finding engaging, popular Shorts.",
              },
            ],
          },
          contents: [{ parts: [{ text: query }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 64,
          },
        }),
      }
    );

    if (!res.ok) {
      console.error("Gemini API error:", res.status, await res.text());
      return NextResponse.json({ searchQuery: query });
    }

    const data = await res.json();
    const optimized =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    return NextResponse.json({ searchQuery: optimized || query });
  } catch (err) {
    console.error("Gemini optimization failed:", err);
    return NextResponse.json({ searchQuery: query });
  }
}
