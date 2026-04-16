import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { authOptions } from "@/lib/auth-options";
import {
  extractBearer,
  signExtensionToken,
  verifyExtensionToken,
} from "@/lib/auth-extension";

/**
 * POST /api/auth/extension-token
 * Requires a valid NextAuth session. Returns a signed 90-day extension token
 * the Chrome extension stores in chrome.storage.local and sends as
 * `Authorization: Bearer <token>`.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  const mongoUserId = session?.user?.mongoUserId?.trim();
  const name = session?.user?.name?.trim() ?? "";
  const linkedinSub = session?.user?.linkedinId?.trim() ?? "";

  if (!mongoUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await signExtensionToken({ mongoUserId, name, linkedinSub });
    return NextResponse.json({
      token: result.token,
      expires_at: result.expires_at,
      user: { name, linkedinSub },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to sign token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/auth/extension-token
 * Lets the extension verify its stored token is still valid without a session cookie.
 * Pass the token as `Authorization: Bearer <token>`.
 */
export async function GET(req: NextRequest) {
  const bearer = extractBearer(req.headers.get("authorization"));
  const payload = await verifyExtensionToken(bearer);

  if (!payload) {
    return NextResponse.json({ valid: false, error: "Invalid or expired token" }, { status: 401 });
  }

  return NextResponse.json({
    valid: true,
    user: {
      id: payload.sub,
      name: payload.name,
      linkedinSub: payload.linkedinSub,
    },
    expires_at: new Date(payload.exp * 1000).toISOString(),
  });
}
