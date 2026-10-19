import { NextResponse } from "next/server";
import { withSession, errorResponse } from "@/lib/api-guard";
import { readSessionClaims, createSessionCookie } from "@/lib/auth";
import { signOutOtherSessions } from "@/lib/users";

/** Bumps sessionVersion so every other browser's session cookie stops working, then re-signs the caller's own cookie onto the new version. */
export const POST = withSession(async (_req, _ctx, userId) => {
  try {
    const sessionVersion = signOutOtherSessions(userId);
    const claims = await readSessionClaims();
    await createSessionCookie(userId, sessionVersion, claims?.activeTelegramAccountId ?? null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
