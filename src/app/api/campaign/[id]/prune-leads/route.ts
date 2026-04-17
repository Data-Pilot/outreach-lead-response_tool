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

type PruneBody = {
  keep_lead_ids?: string[];
};

/**
 * POST /api/campaign/:id/prune-leads
 * Deletes all leads on this campaign except those listed in keep_lead_ids.
 * Use after prospecting so the workspace only contains the chosen subset.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id?.trim();
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
    }

    const body = (await req.json()) as PruneBody;
    const rawIds = Array.isArray(body.keep_lead_ids) ? body.keep_lead_ids : [];
    const keepIds = rawIds
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter((x) => x && mongoose.Types.ObjectId.isValid(x));

    if (keepIds.length === 0) {
      return NextResponse.json(
        { error: "Select at least one lead to keep in this campaign." },
        { status: 400 }
      );
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

    const objectIds = keepIds.map((x) => new mongoose.Types.ObjectId(x));
    const ownedCount = await Lead.countDocuments({
      _id: { $in: objectIds },
      campaign_id: id,
    });
    if (ownedCount !== keepIds.length) {
      return NextResponse.json(
        { error: "One or more lead ids are invalid for this campaign." },
        { status: 400 }
      );
    }

    await Lead.deleteMany({
      campaign_id: id,
      _id: { $nin: objectIds },
    });

    const total = await Lead.countDocuments({ campaign_id: id });
    await Campaign.findByIdAndUpdate(id, { total_leads: total });

    return NextResponse.json({ ok: true, total_leads: total });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
