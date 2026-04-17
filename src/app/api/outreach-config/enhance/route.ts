import { NextResponse } from "next/server";

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

const GEMINI_MODEL =
  process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

type Body = { text?: unknown };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const raw =
      typeof body.text === "string" ? body.text.trim() : "";

    if (!raw) {
      return NextResponse.json(
        { error: "text is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is missing" },
        { status: 500 }
      );
    }

    const prompt = [
      "You are an expert B2B positioning strategist. Your task is to refine a Strategic Identity used for AI-driven outreach. The subject may be a company or an individual professional.",
      "",
      "Rewrite the text below into one or two tight paragraphs that are:",
      "- Clear and easy to understand",
      "- Confident but not exaggerated",
      "- Specific about who they serve, what they do, and the value they deliver",
      "- Focused on differentiation (what makes them meaningfully distinct)",
      "",
      "Preserve all factual accuracy. Do not invent capabilities, clients, roles, or results. If something is vague, clarify it without adding new claims.",
      "",
      "Adapt appropriately:",
      "- If it is a company, emphasize offering, market, and differentiation",
      "- If it is an individual, emphasize expertise, role, and outcomes delivered",
      "",
      "Improve:",
      "- Clarity (remove fluff, simplify phrasing)",
      "- Precision (replace generic terms with concrete ones where possible)",
      "- Positioning (highlight target customer, problem, and outcome)",
      "",
      "Avoid:",
      "- Buzzwords and hype (e.g., “cutting-edge”, “world-class”, “revolutionary” unless explicitly stated)",
      "- Overly corporate language when the subject is an individual",
      "- Bullet points, lists, or headings",
      "- Markdown formatting",
      "",
      "Output plain text only.",
      "",
      "Original:",
      raw,
    ].join("\n");

    const response = await fetch(
      `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7 },
        }),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const details = await response.text();
      return NextResponse.json(
        { error: `Gemini request failed (${response.status})`, details },
        { status: 502 }
      );
    }

    const payload = (await response.json()) as GeminiGenerateContentResponse;
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!text) {
      return NextResponse.json(
        { error: "Gemini returned empty text" },
        { status: 502 }
      );
    }

    return NextResponse.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
