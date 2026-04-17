import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { Campaign } from "../../../../models/Campaign";
import { Lead } from "../../../../models/Lead";
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

    const userId = await getMongoUserIdFromSession();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaign = await Campaign.findById(campaignId).lean();
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (!userOwnsOrLegacyCampaign(campaign, userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const totalLeadCount = await Lead.countDocuments({ campaign_id: campaignId });

    const perPageParam = searchParams.get("per_page")?.trim() ?? "";
    const pageParam = searchParams.get("page")?.trim() ?? "";
    const parsedPer = Number.parseInt(perPageParam, 10);
    const usePagination = perPageParam.length > 0 && !Number.isNaN(parsedPer) && parsedPer > 0;

    let page = 1;
    let perPage = Math.max(totalLeadCount, 1);

    const leadDocs = usePagination
      ? await (async () => {
          perPage = Math.min(100, Math.max(1, parsedPer || 25));
          page = Math.max(1, Number.parseInt(pageParam, 10) || 1);
          const skip = (page - 1) * perPage;
          return Lead.find({ campaign_id: campaignId })
            .sort({ created_at: 1 })
            .skip(skip)
            .limit(perPage)
            .lean();
        })()
      : await Lead.find({ campaign_id: campaignId }).sort({ created_at: 1 }).lean();

    const leads = leadDocs.map((doc) => ({
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
    }));

    return NextResponse.json({
      campaign: {
        id: String(campaign._id),
        name: campaign.name ?? "",
        total_leads: totalLeadCount,
        sent_count: campaign.sent_count ?? 0,
        status: campaign.status ?? "draft",
      },
      leads,
      ...(usePagination
        ? {
            page,
            per_page: perPage,
            total_leads: totalLeadCount,
            has_more: page * perPage < totalLeadCount,
          }
        : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
