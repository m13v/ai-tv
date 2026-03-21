import { NextRequest, NextResponse } from "next/server";

// Scrape YouTube Shorts search results without requiring a Data API key
// We fetch the mobile YouTube search page and extract video IDs from Shorts links
export async function POST(req: NextRequest) {
  const { query } = await req.json();

  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  try {
    const encoded = encodeURIComponent(query);
    // sp=EgIYAQ%3D%3D filters to Shorts only
    const url = `https://m.youtube.com/results?search_query=${encoded}&sp=EgIYAQ%3D%3D`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    const html = await res.text();

    // Extract Shorts video IDs from the HTML
    const shortsRegex = /\/shorts\/([a-zA-Z0-9_-]{11})/g;
    const ids = new Set<string>();
    let match;
    while ((match = shortsRegex.exec(html)) !== null) {
      ids.add(match[1]);
    }

    const videoIds = Array.from(ids).slice(0, 20);

    if (videoIds.length === 0) {
      // Fallback: try regular video IDs
      const videoRegex = /watch\?v=([a-zA-Z0-9_-]{11})/g;
      while ((match = videoRegex.exec(html)) !== null) {
        ids.add(match[1]);
      }
      return NextResponse.json({
        videoIds: Array.from(ids).slice(0, 20),
        query,
      });
    }

    return NextResponse.json({ videoIds, query });
  } catch (err) {
    console.error("YouTube search failed:", err);
    return NextResponse.json({ videoIds: [], query, error: "Search failed" });
  }
}
