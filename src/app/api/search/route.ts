import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { query } = await req.json();

  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  try {
    const encoded = encodeURIComponent(query);
    // sp=EgIYAQ%3D%3D filters to Shorts only
    const url = `https://www.youtube.com/results?search_query=${encoded}&sp=EgIYAQ%3D%3D`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    const html = await res.text();

    // Extract video IDs from the server-rendered JSON in the HTML
    const videoIdRegex = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
    const ids: string[] = [];
    const seen = new Set<string>();
    let match;
    while ((match = videoIdRegex.exec(html)) !== null) {
      if (!seen.has(match[1])) {
        seen.add(match[1]);
        ids.push(match[1]);
      }
    }

    const videoIds = ids.slice(0, 20);

    return NextResponse.json({ videoIds, query });
  } catch (err) {
    console.error("YouTube search failed:", err);
    return NextResponse.json({ videoIds: [], query, error: "Search failed" });
  }
}
