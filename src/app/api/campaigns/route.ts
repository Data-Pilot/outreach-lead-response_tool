import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { Campaign } from "../../../../models/Campaign";
import { getMongoUserIdFromSession } from "@/lib/campaign-access";

function buildCampaignQuery(userId: string) {
  const ownerId = new mongoose.Types.ObjectId(userId);
  return {
    $or: [
      { owner_id: ownerId },
      { owner_id: null },
      { owner_id: { $exists: false } },
    ],
  };
}

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

/**
 * GET /api/campaigns?limit=25
 * Recent campaigns for pickers and empty states.
 */
export async function GET(req: Request) {
  try {
    await connectToMongo();
    const userId = await getMongoUserIdFromSession();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("limit");
    const limit = Math.min(50, Math.max(1, Number(raw) || 25));

    const rows = await Campaign.find(buildCampaignQuery(userId))
      .sort({ created_at: -1 })
      .limit(limit)
      .select({ name: 1, total_leads: 1, sent_count: 1, status: 1, created_at: 1 })
      .lean();

    return NextResponse.json({
      campaigns: rows.map((c) => ({
        id: String(c._id),
        name: String(c.name ?? "Campaign"),
        total_leads: Number(c.total_leads ?? 0),
        sent_count: Number(c.sent_count ?? 0),
        status: String(c.status ?? "draft"),
        created_at: c.created_at ? new Date(c.created_at).toISOString() : null,
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list campaigns";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
