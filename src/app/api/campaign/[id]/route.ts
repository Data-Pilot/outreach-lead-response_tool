import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { Campaign } from "../../../../../models/Campaign";
import { Lead } from "../../../../../models/Lead";
import {
  getMongoUserIdFromSession,
  userOwnsOrLegacyCampaign,
} from "@/lib/campaign-access";

declare global {
  // eslint-disable-next-line no-var
  var __mongooseConnPromise: Promise<typeof mongoose> | undefined;
}

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

type CampaignFilters = {
  person_titles?: string[];
  person_locations?: string[];
  industry?: string;
  company_size?: string;
  keywords?: string;
  role?: string;
  location?: string;
};

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id?.trim();
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
    }

    await connectToMongo();

    const userId = await getMongoUserIdFromSession();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaign = await Campaign.findById(id).lean();
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (!userOwnsOrLegacyCampaign(campaign, userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if (typeof body.subject === "string") updates.subject = body.subject;
    if (typeof body.body === "string") updates.body = body.body;
    if (typeof body.name === "string") updates.name = body.name.trim();

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updated = await Campaign.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    return NextResponse.json({
      campaign: {
        id: String(updated!._id),
        name: updated!.name,
        subject: updated!.subject ?? "",
        body: updated!.body ?? "",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id?.trim();
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
    }

    await connectToMongo();

    const userId = await getMongoUserIdFromSession();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaign = await Campaign.findById(id).lean();
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (!userOwnsOrLegacyCampaign(campaign, userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const filters = (campaign.filters ?? {}) as CampaignFilters;
    const jobRoles = uniqueTrim([
      ...(filters.person_titles ?? []),
      ...(filters.role ? [filters.role] : []),
    ]);
    const industry = (filters.industry ?? "").trim();

    const leadCount = await Lead.countDocuments({ campaign_id: id });
    const firstLead = await Lead.findOne({ campaign_id: id })
      .sort({ created_at: 1 })
      .lean();

    return NextResponse.json({
      campaign: {
        id: String(campaign._id),
        name: campaign.name,
        job_roles: jobRoles,
        industry,
        total_leads: leadCount,
        filters,
        subject: campaign.subject ?? "",
        body: campaign.body ?? "",
      },
      first_lead: firstLead
        ? {
            name: firstLead.name ?? "",
            company: firstLead.company ?? "",
            email: firstLead.email ?? "",
            role: firstLead.role ?? "",
            location: firstLead.location ?? "",
            email_subject: firstLead.email_subject ?? "",
            email_body: firstLead.email_body ?? "",
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function uniqueTrim(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
