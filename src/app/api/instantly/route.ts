import { NextResponse } from "next/server";

import {
  addLeads,
  createCampaign,
  getCampaignStats,
  launchCampaign,
  type LeadForInstantly,
} from "@/lib/instantly";

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
    const campaign_id = searchParams.get("campaign_id");
    if (!campaign_id?.trim()) {
      return NextResponse.json(
        { error: "campaign_id query parameter is required" },
        { status: 400 }
      );
    }
    const stats = await getCampaignStats(campaign_id.trim());
    return NextResponse.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
