import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth-options";
import { connectToMongo } from "@/lib/mongodb";
import { User } from "../../../../../models/User";

/**
 * GET /api/user/me
 * Returns the persisted app user for the current session (MongoDB `Users`).
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const mongoUserId = session?.user?.mongoUserId?.trim();
  if (!mongoUserId || !mongoose.Types.ObjectId.isValid(mongoUserId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToMongo();
    const doc = await User.findById(mongoUserId).lean();
    if (!doc) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({
      user: {
        id: String(doc._id),
        linkedin_sub: doc.linkedin_sub,
        email: doc.email ?? "",
        name: doc.name ?? "",
        image: doc.image ?? "",
        last_login_at: doc.last_login_at
          ? new Date(doc.last_login_at).toISOString()
          : null,
        created_at: doc.created_at
          ? new Date(doc.created_at).toISOString()
          : null,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load user";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
