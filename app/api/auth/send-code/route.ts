import { NextResponse } from "next/server";
import { withSession, errorResponse } from "@/lib/api-guard";
import { setLoginIdCookie } from "@/lib/auth";
import { startLogin } from "@/lib/mtproto";
import { rateLimit } from "@/lib/rate-limit";

/** Starts binding a new Telegram account to the current dashboard user. Rate-limited per dashboard user, since this triggers a real Telegram auth.SendCode call against the app's own API_ID. */
export const POST = withSession(async (req, _ctx, userId) => {
  try {
    if (!rateLimit(`send-code:${userId}`, 10, 10 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }
    const { phoneNumber } = await req.json();
    if (typeof phoneNumber !== "string" || !phoneNumber.trim()) {
      return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
    }
    const { loginId } = await startLogin(phoneNumber.trim(), userId);
    await setLoginIdCookie(loginId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
