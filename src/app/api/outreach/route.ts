import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { Campaign } from "../../../../models/Campaign";
import { Lead } from "../../../../models/Lead";

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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaign_id")?.trim() ?? "";

    if (!campaignId || !mongoose.Types.ObjectId.isValid(campaignId)) {
      return NextResponse.json(
        { error: "campaign_id query parameter is required and must be valid" },
        { status: 400 }
      );
    }

    await connectToMongo();

    const campaign = await Campaign.findById(campaignId).lean();
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const leadDocs = await Lead.find({ campaign_id: campaignId })
      .sort({ created_at: 1 })
      .lean();

    const leads = leadDocs.map((doc) => ({
      _id: String(doc._id),
      name: doc.name ?? "",
      company: doc.company ?? "",
      role: doc.role ?? "",
      email: doc.email ?? "",
      linkedin_url: doc.linkedin_url ?? "",
      status: doc.status ?? "fetched",
      approved_variation: doc.approved_variation ?? "",
      variations: {
        a: doc.variations?.a ?? "",
        b: doc.variations?.b ?? "",
        c: doc.variations?.c ?? "",
      },
    }));

    return NextResponse.json({
      campaign: {
        id: String(campaign._id),
        name: campaign.name ?? "",
        total_leads: leads.length,
        sent_count: campaign.sent_count ?? 0,
        status: campaign.status ?? "draft",
      },
      leads,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
