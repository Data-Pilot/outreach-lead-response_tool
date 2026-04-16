import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { Campaign } from "../../../../models/Campaign";
import { Lead } from "../../../../models/Lead";
import { OutreachConfig } from "../../../../models/OutreachConfig";
import {
  getMongoUserIdFromSession,
  userOwnsOrLegacyCampaign,
} from "@/lib/campaign-access";

type GenerateRequestBody = {
  lead_id?: string;
  lead_ids?: string[];
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
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

function normalizeLeadIds(input: GenerateRequestBody): string[] {
  const ids = new Set<string>();

  if (input.lead_id?.trim()) {
    ids.add(input.lead_id.trim());
  }

  if (Array.isArray(input.lead_ids)) {
    for (const id of input.lead_ids) {
      if (typeof id === "string" && id.trim()) {
        ids.add(id.trim());
      }
    }
  }

  return Array.from(ids);
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

function parseGeminiEmail(text: string): { subject: string; body: string } {
  const maybeJson = extractJsonFromText(text);
  const parsed = JSON.parse(maybeJson) as { subject?: unknown; body?: unknown };

  if (typeof parsed.subject !== "string" || typeof parsed.body !== "string") {
    throw new Error("Gemini response did not match expected email schema");
  }

  return {
    subject: parsed.subject.trim(),
    body: parsed.body.trim(),
  };
}

async function fetchOutreachConfig() {
  const config = await OutreachConfig.findOne({ singleton_key: "default" }).lean();
  return {
    global_context: String(config?.global_context ?? "").trim(),
    tone: String(config?.tone ?? "professional").trim(),
  };
}

async function generateEmailForLead(
  lead: {
    _id: mongoose.Types.ObjectId;
    name: string;
    email: string;
    role: string;
    company: string;
    company_size: string;
    industry: string;
    location: string;
  },
  outreachConfig: { global_context: string; tone: string }
): Promise<{ subject: string; body: string }> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  const contextLines: string[] = [];
  if (outreachConfig.global_context) {
    contextLines.push(`Company context: ${outreachConfig.global_context}`);
  }
  if (outreachConfig.tone) {
    contextLines.push(`Tone: ${outreachConfig.tone}`);
  }

  const prompt = [
    "You are an expert B2B outbound SDR copywriter.",
    ...(contextLines.length > 0 ? ["", ...contextLines] : []),
    "",
    "Lead profile:",
    `- Name: ${lead.name || "Unknown"}`,
    `- Email: ${lead.email || "Unknown"}`,
    `- Role: ${lead.role || "Unknown"}`,
    `- Company: ${lead.company || "Unknown"}`,
    `- Company size: ${lead.company_size || "Unknown"}`,
    `- Industry: ${lead.industry || "Unknown"}`,
    `- Location: ${lead.location || "Unknown"}`,
    "",
    "Write ONE concise cold email for this lead.",
    "Provide:",
    "- subject: 1 subject line",
    "- body: exactly 3 sentences",
    "",
    "Return ONLY valid JSON with this exact shape:",
    '{ "subject": "...", "body": "..." }',
  ].join("\n");

  const response = await fetch(
    `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.8,
        },
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

  return parseGeminiEmail(text);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GenerateRequestBody;
    const leadIds = normalizeLeadIds(body);

    if (leadIds.length === 0) {
      return NextResponse.json(
        { error: "Provide lead_id or lead_ids" },
        { status: 400 }
      );
    }

    const invalidIds = leadIds.filter((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: "Invalid lead id(s)", invalid_ids: invalidIds },
        { status: 400 }
      );
    }

    await connectToMongo();

    const userId = await getMongoUserIdFromSession();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const leads = await Lead.find({ _id: { $in: leadIds } }).select(
      "campaign_id name email role company company_size industry location"
    );

    const campaignIdSet = new Set<string>();
    for (const lead of leads) {
      const cid = lead.campaign_id != null ? String(lead.campaign_id) : "";
      if (cid && mongoose.Types.ObjectId.isValid(cid)) campaignIdSet.add(cid);
    }
    for (const cid of Array.from(campaignIdSet)) {
      const c = await Campaign.findById(cid).lean();
      if (!c || !userOwnsOrLegacyCampaign(c, userId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const foundLeadIdSet = new Set(leads.map((lead) => String(lead._id)));
    const missingLeadIds = leadIds.filter((id) => !foundLeadIdSet.has(id));

    const leadsWithEmail = leads.filter((lead) => (lead.email ?? "").trim());

    const generated: Array<{
      lead_id: string;
      email: { subject: string; body: string };
    }> = [];

    const outreachConfig = await fetchOutreachConfig();

    for (const lead of leadsWithEmail) {
      const email = await generateEmailForLead(
        {
          _id: lead._id,
          name: lead.name ?? "",
          email: lead.email ?? "",
          role: lead.role ?? "",
          company: lead.company ?? "",
          company_size: lead.company_size ?? "",
          industry: lead.industry ?? "",
          location: lead.location ?? "",
        },
        outreachConfig
      );

      await Lead.findByIdAndUpdate(lead._id, {
        email_subject: email.subject,
        email_body: email.body,
      });

      generated.push({
        lead_id: String(lead._id),
        email,
      });
    }

    const skippedNoEmail = leads
      .filter((lead) => !(lead.email ?? "").trim())
      .map((lead) => String(lead._id));

    return NextResponse.json({
      processed_count: generated.length,
      missing_lead_ids: missingLeadIds,
      skipped_no_email: skippedNoEmail,
      generated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
