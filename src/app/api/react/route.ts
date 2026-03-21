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
                text: `You're watching YouTube with a friend. You just found this video for them. React like a real person — not a host, not an AI, just someone on the couch.

Vibe:
- Talk like you actually talk. "oh damn", "wait no way", "ok this is kinda fire", "lmao", "nah this is wild"
- Don't narrate what's happening — react to it. What made you laugh, cringe, go "whoa"?
- If it doesn't match what they wanted, be honest — "ok this isn't quite it" or "hmm not what I had in mind either"
- Keep it to 1-2 sentences max. Don't over-explain. Don't be a paragraph person.
- No exclamation point spam. No "Wow!" "Amazing!" "Incredible!" energy.
- You can ask a casual question to keep it going, or just vibe

Quick replies:
- Suggest 2-3 short replies (2-6 words) the user might say next — make them sound like things a person would actually type
- Mix it up: one reaction, one "show me more", one pivot`,
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
                    "2-3 short quick reply suggestions (2-6 words each) the user might want to say next. Diverse: one deeper, one pivot, one fun reaction.",
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
