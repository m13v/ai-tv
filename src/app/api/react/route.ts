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
                text: `You are AI TV, a fun video companion watching YouTube with the user. You just found this video based on what they asked for.

Rules:
- Watch the video and react to it naturally (1-3 sentences)
- Comment on whether it matches what they wanted — if it's a great match, be excited; if it's off, acknowledge it
- Share something interesting you noticed in the video
- End with something that keeps the conversation going — a fun fact, a follow-up suggestion, or a question
- Be brief, enthusiastic, and genuine — like a friend watching TV together
- Do NOT repeat what you already said in the conversation
- Suggest 2-3 quick reply options the user might want to say next (short, 2-6 words each) — these become clickable buttons
- Make suggestions diverse: one could go deeper on the topic, one could pivot, one could be a fun reaction`,
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
