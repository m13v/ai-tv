import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const { feedback, userEmail, videoId, messageCount, userAgent } =
    (await req.json()) as {
      feedback: string;
      userEmail?: string;
      videoId?: string;
      messageCount?: number;
      userAgent?: string;
    };

  if (!feedback?.trim()) {
    return NextResponse.json({ error: "feedback required" }, { status: 400 });
  }

  const { error } = await resend.emails.send({
    from: "AI TV Reports <matt@vidq.tv>",
    to: "i@m13v.com",
    replyTo: userEmail || undefined,
    subject: `AI TV Report${videoId ? ` — video: ${videoId}` : ""}`,
    text: [
      `Feedback: ${feedback}`,
      userEmail ? `User email: ${userEmail}` : null,
      videoId ? `Video: https://youtube.com/watch?v=${videoId}` : null,
      messageCount != null ? `Messages in session: ${messageCount}` : null,
      userAgent ? `User agent: ${userAgent}` : null,
      `Time: ${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  if (error) {
    console.error("Resend error:", error);
    return NextResponse.json({ error: "failed to send report" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
