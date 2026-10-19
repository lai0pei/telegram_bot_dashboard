import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { clearSessionCookie } from "@/lib/auth";
import { logout } from "@/lib/mtproto";

export const POST = withAuth(async (_req, _ctx, userId) => {
  try {
    await logout(userId);
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
