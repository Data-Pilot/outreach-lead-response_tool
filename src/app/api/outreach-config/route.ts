import mongoose from "mongoose";
import { NextResponse } from "next/server";

import {
  OutreachConfig,
  type OutreachConfigDTO,
  type OutreachTone,
} from "../../../../models/OutreachConfig";
import { getMongoUserIdFromSession } from "@/lib/campaign-access";

declare global {
  // eslint-disable-next-line no-var
  var __mongooseConnPromise: Promise<typeof mongoose> | undefined;
}

const TONES: OutreachTone[] = ["professional", "casual", "direct"];

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

function isTone(value: unknown): value is OutreachTone {
  return typeof value === "string" && (TONES as readonly string[]).includes(value);
}

/** Avoid legacy `singleton_key: "default"` unique index — one row per user in DB. */
function singletonKeyForUser(userId: string) {
  return `user:${userId}`;
}

function toPayload(doc: {
  global_context?: string;
  tone?: string;
  daily_linkedin_limit?: number;
  updated_at?: Date;
}): OutreachConfigDTO {
  return {
    global_context: doc.global_context ?? "",
    tone: isTone(doc.tone) ? doc.tone : "professional",
    daily_linkedin_limit: Math.min(
      50,
      Math.max(1, Number(doc.daily_linkedin_limit ?? 20) || 20)
    ),
    updated_at: doc.updated_at?.toISOString() ?? null,
  };
}

export async function GET() {
  try {
    await connectToMongo();

    const userId = await getMongoUserIdFromSession();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let doc = await OutreachConfig.findOne({ user_id: userId }).lean();

    if (!doc) {
      const created = await OutreachConfig.create({
        user_id: userId,
        singleton_key: singletonKeyForUser(userId),
        global_context: "",
        tone: "professional",
        daily_linkedin_limit: 20,
        updated_at: new Date(),
      });
      doc = created.toObject();
    }

    return NextResponse.json({ config: toPayload(doc) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type PutBody = {
  global_context?: unknown;
  tone?: unknown;
  daily_linkedin_limit?: unknown;
};

export async function PUT(req: Request) {
  try {
    await connectToMongo();
    const userId = await getMongoUserIdFromSession();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as PutBody;

    const updates: {
      global_context?: string;
      tone?: OutreachTone;
      daily_linkedin_limit?: number;
    } = {};

    if (body.global_context !== undefined) {
      if (typeof body.global_context !== "string") {
        return NextResponse.json(
          { error: "global_context must be a string" },
          { status: 400 }
        );
      }
      updates.global_context = body.global_context;
    }

    if (body.tone !== undefined) {
      if (!isTone(body.tone)) {
        return NextResponse.json(
          { error: "tone must be professional, casual, or direct" },
          { status: 400 }
        );
      }
      updates.tone = body.tone;
    }

    if (body.daily_linkedin_limit !== undefined) {
      const n = Number(body.daily_linkedin_limit);
      if (!Number.isFinite(n) || n < 1 || n > 50) {
        return NextResponse.json(
          { error: "daily_linkedin_limit must be a number between 1 and 50" },
          { status: 400 }
        );
      }
      updates.daily_linkedin_limit = Math.round(n);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Provide at least one of global_context, tone, daily_linkedin_limit" },
        { status: 400 }
      );
    }

    const $set = { ...updates, updated_at: new Date() } as Record<string, unknown>;
    // `user_id` comes from the filter on upsert insert; omit from $setOnInsert so
    // strict schema validation stays aligned with the query document.
    const $setOnInsert: Record<string, unknown> = {
      singleton_key: singletonKeyForUser(userId),
    };
    if (updates.global_context === undefined) $setOnInsert.global_context = "";
    if (updates.tone === undefined) $setOnInsert.tone = "professional";
    if (updates.daily_linkedin_limit === undefined) $setOnInsert.daily_linkedin_limit = 20;

    const doc = await OutreachConfig.findOneAndUpdate(
      { user_id: userId },
      { $set, $setOnInsert },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    if (!doc) {
      return NextResponse.json({ error: "Failed to save config" }, { status: 500 });
    }

    return NextResponse.json({ config: toPayload(doc) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
