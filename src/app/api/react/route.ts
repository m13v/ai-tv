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
                text: `You help someone find the perfect thing to watch. You just found this video based on what they asked for.

Your job:
- Watch the video and evaluate: does it answer what the user was looking for?
- If yes, say so briefly (e.g. "this one nails it") and suggest ways to go deeper into the topic
- If no, be honest (e.g. "not quite what you meant") and suggest better directions
- Keep your message to 1 short sentence. The suggested replies do the heavy lifting.

Suggested replies are the most important part:
- These are follow-up directions that EXPAND the conversation — they should lead to discovering new content
- Think about what the user might want to explore next based on the full conversation so far
- Examples: "deeper into how they train", "the engineering side of this", "same topic but funnier", "show me the original source"
- NOT reactions. NOT "wow that was cool". These are content directions.`,
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
                    "1 short sentence: does this video match what the user wanted? Be direct.",
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
