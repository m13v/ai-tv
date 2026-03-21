import { NextRequest, NextResponse } from "next/server";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  const { messages } = (await req.json()) as { messages: Message[] };

  if (!messages?.length) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "no API key" }, { status: 500 });
  }

  // Build Gemini conversation history
  const geminiContents = messages.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text: `You are AI TV, a fun and knowledgeable video companion. You watch YouTube Shorts with the user and have conversations about what they want to see.

Rules:
- Be enthusiastic, brief (1-3 sentences), and engaging
- Comment on the topic, share a fun fact, or react to what they want to watch
- The searchQuery should reflect what the user wants to see NOW based on the full conversation
- If the user asks a follow-up or wants something related, adjust the searchQuery accordingly
- Keep messages short and fun — you're a TV companion, not a lecturer
- If the user says something vague like "hi" or "what's up", pick something trending and fun`,
              },
            ],
          },
          contents: geminiContents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 256,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 0 },
            responseSchema: {
              type: "OBJECT",
              properties: {
                message: {
                  type: "STRING",
                  description:
                    "Your conversational response to the user. Brief, fun, engaging. 1-3 sentences.",
                },
                searchQuery: {
                  type: "STRING",
                  description:
                    "A YouTube search query (2-5 words) to find matching Shorts videos for the current conversation.",
                },
              },
              required: ["message", "searchQuery"],
            },
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("Gemini API error:", res.status, errText);
      return NextResponse.json(
        { error: "Gemini API error" },
        { status: 502 }
      );
    }

    const data = await res.json();
    const rawText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

    console.log(
      `Gemini chat: raw="${rawText.substring(0, 100)}" model=${data?.modelVersion}, thinking=${data?.usageMetadata?.thoughtsTokenCount ?? 0}`
    );

    let parsed: { message: string; searchQuery: string };
    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error("Failed to parse Gemini JSON:", rawText);
      parsed = {
        message: rawText.replace(/[{}"`]/g, "").trim() || "Let me find something great for you!",
        searchQuery: messages[messages.length - 1].content,
      };
    }

    return NextResponse.json({
      message: parsed.message,
      searchQuery: parsed.searchQuery,
    });
  } catch (err) {
    console.error("Gemini chat failed:", err);
    return NextResponse.json({ error: "Chat failed" }, { status: 500 });
  }
}
