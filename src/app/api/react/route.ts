import { NextRequest, NextResponse } from "next/server";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  const { messages, videoId } = (await req.json()) as {
    messages: Message[];
    videoId: string;
  };

  if (!videoId) {
    return NextResponse.json({ error: "videoId required" }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "no API key" }, { status: 500 });
  }

  // Build conversation history as text parts, then add the video
  const historyParts = messages.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));

  // Add a final user turn that includes the YouTube video for Gemini to watch
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const userTurnWithVideo = {
    role: "user",
    parts: [
      {
        fileData: {
          mimeType: "video/*",
          fileUri: videoUrl,
        },
      },
      {
        text: "This is the video I'm currently watching. React to it based on our conversation.",
      },
    ],
  };

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-latest:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text: `You're helping someone find the right thing to watch. You just found this video based on what they asked for. Your job is to figure out if it's what they wanted and help them find what's next.

Your response:
- 1 sentence reacting to the video — keep it casual and human, not hype-y
- Then focus on whether this actually matches what they were looking for. Be honest if it's off.
- If it's a good match, suggest directions to go deeper or explore related topics
- If it's not quite right, say so and suggest what might be better

Quick replies (this is the most important part):
- Suggest 2-3 follow-up queries that help narrow down or expand what the user wants to watch
- These should be actual things to search for, not reactions like "my brain can't" or "that was crazy"
- Good examples: "more like this but longer", "show me the behind the scenes", "switch to nature docs", "something more intense", "try funny ones instead"
- Think: what would the user want to watch NEXT based on this video and what they originally asked for?`,
              },
            ],
          },
          contents: [...historyParts, userTurnWithVideo],
          generationConfig: {
            temperature: 0.8,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                reaction: {
                  type: "STRING",
                  description:
                    "Your reaction to the video. Brief, fun, engaging. 1-3 sentences. Comment on the content and keep the conversation going.",
                },
                matchQuality: {
                  type: "STRING",
                  description:
                    "How well the video matches what the user wanted: 'great', 'okay', or 'miss'",
                  enum: ["great", "okay", "miss"],
                },
                followUpQuery: {
                  type: "STRING",
                  description:
                    "If matchQuality is 'miss', suggest a better YouTube search query (2-5 words). Otherwise leave empty.",
                },
                suggestedReplies: {
                  type: "ARRAY",
                  description:
                    "2-3 follow-up queries about what to watch next (2-6 words each). Focus on content direction, not reactions. e.g. 'more like this', 'try something scarier', 'show me ocean stuff instead'.",
                  items: {
                    type: "STRING",
                  },
                },
              },
              required: ["reaction", "matchQuality", "suggestedReplies"],
            },
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("Gemini react API error:", res.status, errText);
      return NextResponse.json(
        { error: "Gemini API error" },
        { status: 502 }
      );
    }

    const data = await res.json();
    const rawText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

    console.log(
      `Gemini react: raw="${rawText.substring(0, 100)}" model=${data?.modelVersion}`
    );

    let parsed: {
      reaction: string;
      matchQuality: string;
      followUpQuery?: string;
      suggestedReplies?: string[];
    };
    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error("Failed to parse Gemini react JSON:", rawText);
      parsed = {
        reaction: rawText.replace(/[{}"`]/g, "").trim() || "Cool video!",
        matchQuality: "okay",
      };
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Gemini react failed:", err);
    return NextResponse.json({ error: "React failed" }, { status: 500 });
  }
}
