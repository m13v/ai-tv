import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { query } = await req.json();

  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    // Fall back to original query if no key
    return NextResponse.json({ searchQuery: query });
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Convert this user request into a YouTube search query (2-5 words) that will find the best matching Shorts videos. Output ONLY the search query, nothing else.

Examples:
- "I want to learn about space exploration" → "space exploration facts shorts"
- "show me something relaxing" → "satisfying relaxing videos"
- "hi" → "trending viral shorts"
- "funny animals" → "funny animals compilation"

User request: ${query}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 32,
            thinkingConfig: { thinkingBudget: 0 },
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
