import { NextResponse } from "next/server";
import { withSession, errorResponse } from "@/lib/api-guard";
import { clearSessionCookie } from "@/lib/auth";

/** Ends the dashboard session only. Does not touch any linked Telegram account's session — unbinding does that (see /api/telegram-accounts/[id] DELETE). */
export const POST = withSession(async () => {
  try {
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
