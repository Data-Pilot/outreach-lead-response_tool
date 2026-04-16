import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { addLeads, createCampaign, launchCampaign } from "@/lib/instantly";

import { Campaign } from "../../../../../models/Campaign";
import { Lead } from "../../../../../models/Lead";

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

function personalizationForLead(doc: {
  approved_variation?: string;
  variations?: { a?: string; b?: string; c?: string };
}): string {
  const approved = String(doc.approved_variation ?? "").trim();
  if (approved) return approved;
  const a = String(doc.variations?.a ?? "").trim();
  if (a) return a;
  const b = String(doc.variations?.b ?? "").trim();
  if (b) return b;
  return String(doc.variations?.c ?? "").trim();
}

type Body = { campaign_id?: unknown };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const campaignId =
      typeof body.campaign_id === "string" ? body.campaign_id.trim() : "";

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

    const leadDocs = await Lead.find({
      campaign_id: campaignId,
      email: { $exists: true, $nin: ["", null] },
    }).lean();

    const ready = leadDocs.filter((doc) => {
      if (doc.status === "sent") return false;
      const email = String(doc.email ?? "").trim().toLowerCase();
      if (!email) return false;
      return personalizationForLead(doc).length > 0;
    });

    if (ready.length === 0) {
      return NextResponse.json(
        {
          error:
            "No leads ready to send. Enrich for email, generate copy, and ensure each lead has approved text (or variation A).",
        },
        { status: 400 }
      );
    }

    const instantlyName = `Synapse — ${String(campaign.name ?? "Campaign").slice(0, 80)}`;
    const { campaign_id: instantlyCampaignId } = await createCampaign(
      instantlyName,
      {}
    );

    const leadsForApi = ready.map((doc) => ({
      email: String(doc.email ?? "").trim().toLowerCase(),
      name: doc.name ?? "",
      company: doc.company ?? "",
      approved_variation: personalizationForLead(doc),
    }));

    const { leads_added } = await addLeads(instantlyCampaignId, leadsForApi);
    await launchCampaign(instantlyCampaignId);

    const ids = ready.map((d) => d._id);
    await Lead.updateMany(
      { _id: { $in: ids } },
      { $set: { status: "sent" } }
    );

    const prevSent = Number(campaign.sent_count ?? 0);
    await Campaign.findByIdAndUpdate(campaignId, {
      $set: {
        sent_count: prevSent + ready.length,
        status: "sending",
      },
    });

    return NextResponse.json({
      instantly_campaign_id: instantlyCampaignId,
      leads_sent: ready.length,
      leads_added,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
