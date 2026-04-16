import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth-options";
import { connectToMongo } from "@/lib/mongodb";
import { User } from "../../../../../../models/User";

/**
 * POST /api/auth/extension-token/revoke
 *
 * Increments ext_token_version on the User document.
 * All previously issued extension tokens immediately fail DB cross-check.
 * Requires a valid web session (user must be logged into the web app to revoke).
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  const mongoUserId = session?.user?.mongoUserId?.trim();

  if (!mongoUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToMongo();
    const user = await User.findByIdAndUpdate(
      mongoUserId,
      { $inc: { ext_token_version: 1 } },
      { new: true }
    ).select("ext_token_version").lean();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      revoked: true,
      new_version: user.ext_token_version,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Revoke failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
