import mongoose from "mongoose";
import { NextResponse } from "next/server";

import {
  addLeads,
  createCampaign,
  getCampaignStats,
  launchCampaign,
  type LeadForInstantly,
} from "@/lib/instantly";
import { Campaign } from "../../../../models/Campaign";
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

type InstantlyActionBody =
  | {
      action: "createCampaign";
      name: string;
      schedule?: Record<string, unknown>;
    }
  | {
      action: "addLeads";
      campaign_id: string;
      leads: LeadForInstantly[];
    }
  | { action: "launchCampaign"; campaign_id: string };

export async function POST(req: Request) {
  try {
    await connectToMongo();
    const userId = await getMongoUserIdFromSession();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as InstantlyActionBody;

    switch (body.action) {
      case "createCampaign": {
        if (!body.name?.trim()) {
          return NextResponse.json({ error: "name is required" }, { status: 400 });
        }
        const result = await createCampaign(body.name.trim(), body.schedule ?? {});
        return NextResponse.json(result);
      }
      case "addLeads": {
        if (!body.campaign_id?.trim()) {
          return NextResponse.json(
            { error: "campaign_id is required" },
            { status: 400 }
          );
        }
        if (!Array.isArray(body.leads)) {
          return NextResponse.json({ error: "leads must be an array" }, { status: 400 });
        }
        const result = await addLeads(body.campaign_id.trim(), body.leads);
        return NextResponse.json(result);
      }
      case "launchCampaign": {
        if (!body.campaign_id?.trim()) {
          return NextResponse.json(
            { error: "campaign_id is required" },
            { status: 400 }
          );
        }
        const result = await launchCampaign(body.campaign_id.trim());
        return NextResponse.json(result);
      }
      default:
        return NextResponse.json(
          {
            error:
              "Unknown action. Use createCampaign, addLeads, or launchCampaign.",
          },
          { status: 400 }
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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

    const instantlyCampaignId = String(
      campaign.instantly_campaign_id ?? ""
    ).trim();
    if (!instantlyCampaignId) {
      return NextResponse.json(
        { error: "Campaign has not been sent to Instantly yet" },
        { status: 400 }
      );
    }

    const stats = await getCampaignStats(instantlyCampaignId);

    // Update reply_count in the database so it is no longer a dead field
    const replyCount = Number.isFinite(stats.replied) ? stats.replied : 0;
    if (replyCount !== Number(campaign.reply_count ?? 0)) {
      await Campaign.findByIdAndUpdate(campaignId, {
        $set: {
          reply_count: replyCount,
          status: replyCount > 0 ? "complete" : campaign.status,
        },
      });
    }

    return NextResponse.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
