import { NextResponse } from "next/server";

import { Campaign } from "../../../../models/Campaign";
import { Lead } from "../../../../models/Lead";
import {
  buildCampaignListQuery,
  getMongoUserIdFromSession,
} from "@/lib/campaign-access";
import { connectToMongo } from "@/lib/mongodb";

/**
 * Aggregated pipeline counts for the Funnel dashboard (Mongo-backed campaigns).
 */
export async function GET() {
  try {
    await connectToMongo();
    const userId = await getMongoUserIdFromSession();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaignQuery = buildCampaignListQuery(userId);
    const campaigns = await Campaign.find(campaignQuery)
      .select("_id sent_count reply_count")
      .lean();

    const ids = campaigns.map((c) => c._id);
    const emailsSent = campaigns.reduce(
      (acc, c) => acc + Number(c.sent_count ?? 0),
      0
    );

    let prospects = 0;
    let contacted = 0;
    let replied = 0;
    let meetings = 0;

    if (ids.length > 0) {
      prospects = await Lead.countDocuments({ campaign_id: { $in: ids } });
      contacted = await Lead.countDocuments({
        campaign_id: { $in: ids },
        status: { $in: ["sent", "bounced", "replied", "meeting_set"] },
      });
      replied = await Lead.countDocuments({
        campaign_id: { $in: ids },
        status: { $in: ["replied", "meeting_set"] },
      });
      meetings = await Lead.countDocuments({
        campaign_id: { $in: ids },
        status: "meeting_set",
      });
    }

    return NextResponse.json({
      prospects,
      contacted,
      replied,
      meetings,
      emails_sent: emailsSent,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load funnel metrics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
