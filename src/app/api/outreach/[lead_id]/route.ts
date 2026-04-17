import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { Campaign } from "../../../../../models/Campaign";
import { Lead, type LeadStatus } from "../../../../../models/Lead";
import {
  getMongoUserIdFromSession,
  userOwnsOrLegacyCampaign,
} from "@/lib/campaign-access";

declare global {
  // eslint-disable-next-line no-var
  var __mongooseConnPromise: Promise<typeof mongoose> | undefined;
}

const ALLOWED_STATUSES: LeadStatus[] = [
  "fetched",
  "reviewed",
  "sent",
  "bounced",
  "replied",
  "meeting_set",
];

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

function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && (ALLOWED_STATUSES as readonly string[]).includes(value);
}

type PatchBody = {
  status?: unknown;
  approved_variation?: unknown;
};

export async function PATCH(
  req: Request,
  { params }: { params: { lead_id: string } }
) {
  try {
    const leadId = params.lead_id?.trim();
    if (!leadId || !mongoose.Types.ObjectId.isValid(leadId)) {
      return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
    }

    const body = (await req.json()) as PatchBody;
    const updates: { status?: LeadStatus; approved_variation?: string } = {};

    if (body.status !== undefined) {
      if (!isLeadStatus(body.status)) {
        return NextResponse.json(
          { error: "Invalid status", allowed: ALLOWED_STATUSES },
          { status: 400 }
        );
      }
      updates.status = body.status;
    }

    if (body.approved_variation !== undefined) {
      if (typeof body.approved_variation !== "string") {
        return NextResponse.json(
          { error: "approved_variation must be a string" },
          { status: 400 }
        );
      }
      updates.approved_variation = body.approved_variation;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Provide at least one of status, approved_variation" },
        { status: 400 }
      );
    }

    await connectToMongo();

    const userId = await getMongoUserIdFromSession();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await Lead.findById(leadId).lean();
    if (!existing) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const campaignId = String(existing.campaign_id ?? "");
    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      return NextResponse.json({ error: "Invalid campaign on lead" }, { status: 400 });
    }

    const campaign = await Campaign.findById(campaignId).lean();
    if (!campaign || !userOwnsOrLegacyCampaign(campaign, userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const doc = await Lead.findByIdAndUpdate(
      leadId,
      { $set: updates },
      { returnDocument: "after", runValidators: true }
    ).lean();

    if (!doc) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    return NextResponse.json({
      lead: {
        _id: String(doc._id),
        name: doc.name ?? "",
        company: doc.company ?? "",
        role: doc.role ?? "",
        email: doc.email ?? "",
        linkedin_url: doc.linkedin_url ?? "",
        status: doc.status ?? "fetched",
        approved_variation: doc.approved_variation ?? "",
        email_subject: doc.email_subject ?? "",
        email_body: doc.email_body ?? "",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
