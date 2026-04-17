/**
 * Extension token helpers.
 *
 * Identity guarantee:
 *   Every token embeds { sub (mongoUserId), providerSub, provider, tokenVersion }.
 *   On every verify we cross-check all three against the Users collection:
 *     - mongoUserId must exist
 *     - user.linkedin_sub OR user.google_sub must match token.providerSub
 *     - user.ext_token_version must match token.tokenVersion ← revocation support
 *
 * Revoking: increment user.ext_token_version → all existing tokens fail instantly.
 */

import { decode, encode } from "next-auth/jwt";
import mongoose from "mongoose";

import { connectToMongo } from "@/lib/mongodb";
import { User } from "../../models/User";

const TOKEN_TYPE = "extension" as const;
const MAX_AGE_SECONDS = 90 * 24 * 60 * 60; // 90 days

export type ExtensionTokenPayload = {
  sub: string;           // mongoUserId
  name: string;
  providerSub: string;   // linkedin_sub or google_sub depending on provider
  provider: string;      // "linkedin" | "google"
  tokenVersion: number;
  type: typeof TOKEN_TYPE;
  iat: number;
  exp: number;
};

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET is not set");
  return s;
}

/** Create a signed extension token. Reads current ext_token_version from DB. */
export async function signExtensionToken(payload: {
  mongoUserId: string;
  name: string;
  providerSub: string;
  provider: string;
}): Promise<{ token: string; expires_at: string }> {
  await connectToMongo();
  const user = await User.findById(payload.mongoUserId)
    .select("ext_token_version linkedin_sub google_sub")
    .lean();

  if (!user) throw new Error("User not found");

  const expectedSub =
    payload.provider === "google" ? user.google_sub : user.linkedin_sub;
  if (expectedSub !== payload.providerSub) {
    throw new Error("Provider identity mismatch");
  }

  const tokenVersion = user.ext_token_version ?? 0;
  const now = Math.floor(Date.now() / 1000);

  const token = await encode({
    token: {
      sub: payload.mongoUserId,
      name: payload.name,
      providerSub: payload.providerSub,
      provider: payload.provider,
      tokenVersion,
      type: TOKEN_TYPE,
      iat: now,
      exp: now + MAX_AGE_SECONDS,
    },
    secret: secret(),
    maxAge: MAX_AGE_SECONDS,
  });

  return {
    token,
    expires_at: new Date((now + MAX_AGE_SECONDS) * 1000).toISOString(),
  };
}

/**
 * Verify a raw Bearer token with full DB cross-check.
 * Returns { mongoUserId, name, linkedinSub } or null.
 *
 * Rejects if:
 *   - JWT signature invalid / expired
 *   - type !== "extension"
 *   - mongoUserId not found in DB
 *   - token.linkedinSub !== user.linkedin_sub   (account mismatch)
 *   - token.tokenVersion !== user.ext_token_version  (revoked)
 */
export async function verifyExtensionToken(
  raw: string | null | undefined
): Promise<Pick<ExtensionTokenPayload, "sub" | "name" | "providerSub" | "provider" | "exp"> | null> {
  if (!raw) return null;

  // 1. Verify JWT signature + expiry
  let payload: Record<string, unknown>;
  try {
    const decoded = await decode({ token: raw, secret: secret() });
    if (!decoded) return null;
    payload = decoded as Record<string, unknown>;
  } catch {
    return null;
  }

  if (payload.type !== TOKEN_TYPE) return null;

  const exp = payload.exp as number | undefined;
  if (exp && exp < Math.floor(Date.now() / 1000)) return null;

  const mongoUserId = (payload.sub as string | undefined)?.trim();
  const providerSub = (payload.providerSub as string | undefined)?.trim()
    // backwards-compat: old tokens used linkedinSub
    ?? (payload.linkedinSub as string | undefined)?.trim();
  const provider = (payload.provider as string | undefined) ?? "linkedin";
  const tokenVersion = payload.tokenVersion as number | undefined;

  if (!mongoUserId || !mongoose.Types.ObjectId.isValid(mongoUserId)) return null;

  // 2. DB cross-check — proves same person, checks revocation
  try {
    await connectToMongo();
    const user = await User.findById(mongoUserId)
      .select("linkedin_sub google_sub ext_token_version")
      .lean();

    if (!user) return null;

    // Same account? Check the right sub based on provider
    const expectedSub =
      provider === "google" ? user.google_sub : user.linkedin_sub;
    if (expectedSub !== providerSub) return null;

    // Token revoked?
    const currentVersion = user.ext_token_version ?? 0;
    if ((tokenVersion ?? 0) !== currentVersion) return null;
  } catch {
    return null;
  }

  return {
    sub: mongoUserId,
    name: (payload.name as string | undefined) ?? "",
    providerSub: providerSub ?? "",
    provider,
    exp: exp ?? 0,
  };
}

/** Extract Bearer token from an Authorization header value. */
export function extractBearer(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim() || null;
}
