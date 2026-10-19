import { NextResponse } from "next/server";
import { withSession, errorResponse } from "@/lib/api-guard";
import { getUserById } from "@/lib/users";

/** GET: the current dashboard user's own identity (distinct from the active Telegram account's identity, see /api/me). */
export const GET = withSession(async (_req, _ctx, userId) => {
  try {
    const user = getUserById(userId);
    if (!user) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ username: user.username });
  } catch (err) {
    return errorResponse(err);
  }
});
