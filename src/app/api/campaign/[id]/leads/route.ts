import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { Campaign } from "../../../../../../models/Campaign";
import { Lead } from "../../../../../../models/Lead";
import {
  getMongoUserIdFromSession,
  userOwnsOrLegacyCampaign,
} from "@/lib/campaign-access";

declare global {
  // eslint-disable-next-line no-var
  var __mongooseConnPromise: Promise<typeof mongoose> | undefined;
}

async function connectToMongo() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is missing");
  if (!global.__mongooseConnPromise) {
    global.__mongooseConnPromise = mongoose.connect(mongoUri, {
      bufferCommands: false,
    });
  }
  await global.__mongooseConnPromise;
  return mongoose.connection;
}

/**
 * GET /api/campaign/:id/leads
 * Returns all leads for a campaign that have a non-empty email.
 * Used by the review page to build the Instantly payload and dp_sent_log.
 */
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

    const leads = await Lead.find({ campaign_id: id })
      .select("name email role company location linkedin_url phone")
      .lean();

    const withEmail = leads
      .filter((l) => (l.email ?? "").trim())
      .map((l) => ({
        _id: String(l._id),
        name: l.name ?? "",
        email: (l.email ?? "").trim().toLowerCase(),
        role: l.role ?? "",
        company: l.company ?? "",
        location: l.location ?? "",
        linkedin_url: l.linkedin_url ?? "",
        phone: l.phone ?? "",
      }));

    return NextResponse.json({ leads: withEmail, total: withEmail.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
