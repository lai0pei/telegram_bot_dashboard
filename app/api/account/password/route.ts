import { NextResponse } from "next/server";
import { withSession, errorResponse } from "@/lib/api-guard";
import { createSessionCookie, readSessionClaims } from "@/lib/auth";
import { changePassword, getUserById, verifyUserCredentials } from "@/lib/users";
import { validateDashboardPassword } from "@/lib/validation";

export const POST = withSession(async (req, _ctx, userId) => {
  try {
    const { currentPassword, newPassword } = await req.json();
    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      return NextResponse.json({ error: "Current and new password are required." }, { status: 400 });
    }
    const user = getUserById(userId);
    if (!user || !verifyUserCredentials(user.username, currentPassword)) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
    }
    const passwordError = validateDashboardPassword(newPassword);
    if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

    const sessionVersion = changePassword(userId, newPassword);
    const claims = await readSessionClaims();
    await createSessionCookie(userId, sessionVersion, claims?.activeTelegramAccountId ?? null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
