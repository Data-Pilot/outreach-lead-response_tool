import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { Campaign } from "../../../../../models/Campaign";
import { Lead } from "../../../../../models/Lead";

type Body = {
  campaign_id: string;
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

type CampaignFilters = {
  person_titles?: string[];
  person_locations?: string[];
  industry?: string;
  company_size?: string;
  keywords?: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __mongooseConnPromise: Promise<typeof mongoose> | undefined;
}

/** Override with `GEMINI_MODEL` in env. Default is a current Google AI Studio model id. */
const GEMINI_MODEL =
  process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

async function connectToMongo() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing");
  }

  if (!global.__mongooseConnPromise) {
    global.__mongooseConnPromise = mongoose.connect(mongoUri, {
      bufferCommands: false,
    });
  }

  await global.__mongooseConnPromise;
  return mongoose.connection;
}

function extractJsonFromText(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

async function callGemini(prompt: string): Promise<string> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  const response = await fetch(
    `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.85 },
      }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${details}`);
  }

  const payload = (await response.json()) as GeminiGenerateContentResponse;
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini response was empty");
  }
  return text;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const campaignId = body.campaign_id?.trim();
    if (!campaignId || !mongoose.Types.ObjectId.isValid(campaignId)) {
      return NextResponse.json(
        { error: "campaign_id is required and must be valid" },
        { status: 400 }
      );
    }

    await connectToMongo();

    const campaign = await Campaign.findById(campaignId).lean();
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const filters = (campaign.filters ?? {}) as CampaignFilters;
    const firstLead = await Lead.findOne({ campaign_id: campaignId })
      .sort({ created_at: 1 })
      .lean();

    const titles = (filters.person_titles ?? []).join(", ") || "general B2B";
    const locations = (filters.person_locations ?? []).join(", ") || "not specified";
    const industry = filters.industry?.trim() || "not specified";
    const companySize = filters.company_size?.trim() || "not specified";
    const keywords = filters.keywords?.trim() || "not specified";

    const leadHint = firstLead
      ? `Example prospect (for tone only; do not copy verbatim): name "${firstLead.name}", company "${firstLead.company}", role "${firstLead.role}".`
      : "No sample lead on file; keep the template generic but warm.";

    const prompt = [
      "You write concise B2B cold email templates.",
      "",
      "Campaign context:",
      `- Target job titles: ${titles}`,
      `- Industry / keyword focus: ${industry}`,
      `- Person locations: ${locations}`,
      `- Company size filter: ${companySize}`,
      `- Extra keywords: ${keywords}`,
      "",
      leadHint,
      "",
      "Create ONE reusable email template for this campaign.",
      "You MUST include the literal placeholders {{name}} and {{company}} wherever you personalize (greeting and at least one other mention).",
      "Do not invent other {{placeholder}} tokens.",
      "",
      "Return ONLY valid JSON with this exact shape:",
      '{ "subject": "...", "body": "..." }',
      "The body should be plain text (no HTML), 2–4 short paragraphs, professional and friendly.",
    ].join("\n");

    const raw = await callGemini(prompt);
    const parsed = JSON.parse(extractJsonFromText(raw)) as {
      subject?: unknown;
      body?: unknown;
    };

    if (typeof parsed.subject !== "string" || typeof parsed.body !== "string") {
      throw new Error("Gemini did not return subject/body strings");
    }

    return NextResponse.json({
      subject: parsed.subject.trim(),
      body: parsed.body.trim(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
