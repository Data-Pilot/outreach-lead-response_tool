import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { Campaign } from "../../../../../models/Campaign";
import { Lead } from "../../../../../models/Lead";
import {
  getMongoUserIdFromSession,
  userOwnsOrLegacyCampaign,
} from "@/lib/campaign-access";

type EnrichBody = {
  lead_ids?: string[];
};

declare global {
  // eslint-disable-next-line no-var
  var __mongooseConnPromise: Promise<typeof mongoose> | undefined;
}

const APOLLO_BASE_URL = "https://api.apollo.io/api/v1";

function envFlagTrue(value: string | undefined): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Apollo [People Enrichment](https://docs.apollo.io/reference/people-enrichment) — `POST /api/v1/people/match`
 * (user-facing path is often described as “people enrichment”; this is the supported REST route).
 */
const PEOPLE_MATCH_PATH = "/people/match";

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

function extractPhone(person: Record<string, unknown>): string {
  if (typeof person.sanitized_phone === "string" && person.sanitized_phone) {
    return person.sanitized_phone;
  }
  const nums = person.phone_numbers;
  if (Array.isArray(nums)) {
    for (const n of nums) {
      if (n && typeof n === "object") {
        const o = n as Record<string, unknown>;
        if (typeof o.sanitized_number === "string" && o.sanitized_number) {
          return o.sanitized_number;
        }
        if (typeof o.raw_number === "string" && o.raw_number) {
          return o.raw_number;
        }
      }
    }
  }
  if (typeof person.phone === "string" && person.phone) {
    return person.phone;
  }
  return "";
}

async function matchPersonByApolloId(
  apolloId: string,
  apiKey: string
): Promise<{ person: Record<string, unknown> | null; error?: string }> {
  const params = new URLSearchParams({
    id: apolloId,
    reveal_personal_emails: "true",
  });

  const res = await fetch(
    `${APOLLO_BASE_URL}${PEOPLE_MATCH_PATH}?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({}),
      cache: "no-store",
    }
  );

  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return { person: null, error: "Invalid JSON from Apollo" };
  }

  if (!res.ok) {
    return {
      person: null,
      error:
        typeof json.error === "string"
          ? json.error
          : typeof json.message === "string"
            ? json.message
            : text || `HTTP ${res.status}`,
    };
  }

  const person = json.person as Record<string, unknown> | undefined;
  return { person: person ?? null };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as EnrichBody;
    const rawIds = Array.isArray(body.lead_ids) ? body.lead_ids : [];
    const leadIds = rawIds
      .map((id) => String(id).trim())
      .filter((id) => mongoose.Types.ObjectId.isValid(id));

    if (leadIds.length === 0) {
      return NextResponse.json(
        { error: "lead_ids must be a non-empty array of valid Mongo ids" },
        { status: 400 }
      );
    }

    const mockApollo = envFlagTrue(process.env.MOCK_APOLLO);
    const apolloApiKey = process.env.APOLLO_API_KEY;
    if (!mockApollo && !apolloApiKey) {
      return NextResponse.json(
        { error: "APOLLO_API_KEY is missing" },
        { status: 500 }
      );
    }

    await connectToMongo();

    const userId = await getMongoUserIdFromSession();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const enriched: Array<{
      _id: string;
      apollo_person_id: string;
      email: string;
      phone: string;
      name: string;
      company: string;
      linkedin_url: string;
      error?: string;
    }> = [];

    for (const id of leadIds) {
      const lead = await Lead.findById(id).lean();
      if (!lead) {
        enriched.push({
          _id: id,
          apollo_person_id: "",
          email: "",
          phone: "",
          name: "",
          company: "",
          linkedin_url: "",
          error: "Lead not found",
        });
        continue;
      }

      const cid = String(lead.campaign_id ?? "");
      if (!mongoose.Types.ObjectId.isValid(cid)) {
        enriched.push({
          _id: id,
          apollo_person_id: "",
          email: "",
          phone: "",
          name: "",
          company: "",
          linkedin_url: "",
          error: "Invalid campaign",
        });
        continue;
      }
      const campaignDoc = await Campaign.findById(cid).lean();
      if (!campaignDoc || !userOwnsOrLegacyCampaign(campaignDoc, userId)) {
        enriched.push({
          _id: id,
          apollo_person_id: "",
          email: "",
          phone: "",
          name: "",
          company: "",
          linkedin_url: "",
          error: "Forbidden",
        });
        continue;
      }

      const apolloId = (lead.apollo_person_id ?? "").trim();
      if (!apolloId) {
        enriched.push({
          _id: id,
          apollo_person_id: "",
          email: "",
          phone: "",
          name: String(lead.name ?? ""),
          company: String(lead.company ?? ""),
          linkedin_url: "",
          error: "Lead has no apollo_person_id; fetch from search first.",
        });
        continue;
      }

      const existingEmail = String(lead.email ?? "").trim();
      if (existingEmail) {
        enriched.push({
          _id: id,
          apollo_person_id: apolloId,
          email: existingEmail,
          phone: String(lead.phone ?? "").trim(),
          name: String(lead.name ?? ""),
          company: String(lead.company ?? ""),
          linkedin_url: String(lead.linkedin_url ?? "").trim(),
        });
        continue;
      }

      if (mockApollo) {
        const email = `mock+${apolloId}@example.invalid`.toLowerCase();
        const phone = "+10005550199";
        const name = String(lead.name ?? "Mock Lead");
        const company = String(lead.company ?? "Mock Co");
        const linkedin_url = String(lead.linkedin_url ?? "").trim();

        await Lead.findByIdAndUpdate(id, {
          $set: { email, phone, name, company, linkedin_url },
        });

        enriched.push({
          _id: id,
          apollo_person_id: apolloId,
          email,
          phone,
          name,
          company,
          linkedin_url,
        });
        continue;
      }

      const { person, error } = await matchPersonByApolloId(
        apolloId,
        apolloApiKey as string
      );
      if (error || !person) {
        enriched.push({
          _id: id,
          apollo_person_id: apolloId,
          email: "",
          phone: "",
          name: String(lead.name ?? ""),
          company: String(lead.company ?? ""),
          linkedin_url: "",
          error: error ?? "No person returned",
        });
        continue;
      }

      const email = String(person.email ?? "").trim().toLowerCase();
      const phone = extractPhone(person);
      const name = String(person.name ?? lead.name ?? "");
      const company =
        (person.organization as { name?: string } | undefined)?.name ??
        String(lead.company ?? "");
      const linkedin_url = String(person.linkedin_url ?? lead.linkedin_url ?? "").trim();

      await Lead.findByIdAndUpdate(id, {
        $set: { email, phone, name, company, linkedin_url },
      });

      enriched.push({
        _id: id,
        apollo_person_id: apolloId,
        email,
        phone,
        name,
        company,
        linkedin_url,
      });
    }

    return NextResponse.json({
      leads: enriched,
      note: mockApollo
        ? "MOCK_APOLLO is on: no Apollo calls; fake emails written for local/testing."
        : "Each enrich call uses Apollo POST /people/match with reveal_personal_emails=true (credits). Leads that already have a non-empty email skip Apollo. Native phone reveal may require reveal_phone_number + webhook_url per Apollo docs.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
