import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { clearLoginIdCookie, clearSessionCookie } from "@/lib/auth";

/**
 * Ends the dashboard session only. Does not touch any linked Telegram account's session — unbinding does that (see /api/telegram-accounts/[id] DELETE).
 * Deliberately unauthenticated: clearing a cookie needs no proof of identity, and it must work even when the cookie is no longer valid.
 */
export async function POST() {
  try {
    await clearSessionCookie();
    await clearLoginIdCookie();
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
