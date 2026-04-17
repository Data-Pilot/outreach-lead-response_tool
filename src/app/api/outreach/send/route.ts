import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { addLeads, createCampaign, launchCampaign } from "@/lib/instantly";

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

function personalizationForLead(doc: {
  approved_variation?: string;
  email_body?: string;
}): string {
  const approved = String(doc.approved_variation ?? "").trim();
  if (approved) return approved;
  return String(doc.email_body ?? "").trim();
}

function applyTemplate(
  template: string,
  lead: { name?: string; company?: string }
): string {
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, String(lead.name ?? "").trim() || "there")
    .replace(/\{\{\s*company\s*\}\}/gi, String(lead.company ?? "").trim() || "your company");
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

    const campaignSubject = String(campaign.subject ?? "").trim();
    const campaignBody = String(campaign.body ?? "").trim();

    const leadDocs = await Lead.find({
      campaign_id: campaignId,
      email: { $exists: true, $nin: ["", null] },
    }).lean();

    const ready = leadDocs.filter((doc) => {
      if (doc.status === "sent") return false;
      const email = String(doc.email ?? "").trim().toLowerCase();
      if (!email) return false;
      // If campaign has a template, that counts as ready content
      const hasContent =
        personalizationForLead(doc).length > 0 || campaignBody.length > 0;
      return hasContent;
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

    // Reuse existing Instantly campaign if already created (idempotency)
    const existingInstantlyId = String(campaign.instantly_campaign_id ?? "").trim();
    let instantlyCampaignId: string;
    if (existingInstantlyId) {
      instantlyCampaignId = existingInstantlyId;
    } else {
      const instantlyName = `LynkWell AI — ${String(campaign.name ?? "Campaign").slice(0, 80)}`;
      const result = await createCampaign(instantlyName, {});
      instantlyCampaignId = result.campaign_id;
    }

    const leadsForApi = ready.map((doc) => {
      const leadPersonalization = personalizationForLead(doc);
      // Fall back to campaign template if no lead-level personalization exists
      const bodyText =
        leadPersonalization ||
        (campaignBody.length > 0
          ? applyTemplate(campaignBody, { name: doc.name, company: doc.company })
          : "");
      const subjectText =
        campaignSubject.length > 0
          ? applyTemplate(campaignSubject, {
              name: doc.name,
              company: doc.company,
            })
          : "";
      return {
        email: String(doc.email ?? "").trim().toLowerCase(),
        name: doc.name ?? "",
        company: doc.company ?? "",
        approved_variation: bodyText,
        subject: subjectText,
        body: bodyText,
      };
    });

    const { leads_added } = await addLeads(instantlyCampaignId, leadsForApi);
    // Only launch if we just created the campaign; existing campaigns are already active
    if (!existingInstantlyId) {
      await launchCampaign(instantlyCampaignId);
    }

    const ids = ready.map((d) => d._id);
    await Lead.updateMany(
      { _id: { $in: ids } },
      { $set: { status: "sent" } }
    );

    const prevSent = Number(campaign.sent_count ?? 0);
    const newStatus =
      prevSent + ready.length >= Number(campaign.total_leads ?? 0)
        ? "complete"
        : "sending";
    await Campaign.findByIdAndUpdate(campaignId, {
      $set: {
        sent_count: prevSent + ready.length,
        status: newStatus,
        instantly_campaign_id: instantlyCampaignId,
      },
    });

    return NextResponse.json({
      instantly_campaign_id: instantlyCampaignId,
      leads_sent: ready.length,
      leads_added,
      note: "Ensure your Instantly campaign template uses {{personalization}} for the email body and {{custom_variables.subject}} for the subject line.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
