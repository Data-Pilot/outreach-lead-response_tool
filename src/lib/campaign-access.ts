import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";

import { authOptions } from "@/lib/auth-options";
import { extractBearer, verifyExtensionToken } from "@/lib/auth-extension";

/**
 * Resolve mongoUserId from either:
 *   1. A valid NextAuth session cookie  (web app)
 *   2. A valid extension Bearer token   (Chrome extension API calls)
 *
 * Pass the raw `Request` / `NextRequest` to enable Bearer auth.
 * Omit `req` (or pass null) for session-only routes (server components, etc.).
 */
export async function getMongoUserIdFromSession(
  req?: NextRequest | Request | null
): Promise<string | null> {
  // ── 1. Bearer token (extension) ─────────────────────────────────────────
  if (req) {
    const bearer = extractBearer(req.headers.get("authorization"));
    if (bearer) {
      const payload = await verifyExtensionToken(bearer);
      if (payload?.sub && mongoose.Types.ObjectId.isValid(payload.sub)) {
        return payload.sub;
      }
      // Bearer present but invalid → reject immediately, don't fall through
      return null;
    }
  }

  // ── 2. NextAuth session cookie (web app) ─────────────────────────────────
  const session = await getServerSession(authOptions);
  const id = session?.user?.mongoUserId?.trim();
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
  return id;
}

/** `owner_id` null/undefined = legacy row (any signed-in user may access until backfilled). */
export function userOwnsOrLegacyCampaign(
  campaign: { owner_id?: mongoose.Types.ObjectId | null } | null | undefined,
  userId: string | null
): boolean {
  if (!campaign || !userId) return false;
  const owner = campaign.owner_id;
  if (owner == null) return true;
  return String(owner) === userId;
}
