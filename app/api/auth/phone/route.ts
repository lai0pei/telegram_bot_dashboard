import { NextResponse } from "next/server";
import { withSession, errorResponse } from "@/lib/api-guard";
import { startPhoneResponse } from "@/lib/phone-login-response";
import { rateLimit } from "@/lib/rate-limit";

/** Starts binding an extra Telegram account by phone number + code (the QR alternative is /api/auth/qr). Code step: /api/auth/phone/code; 2FA: /api/auth/password. */
export const POST = withSession(async (req, _ctx, userId) => {
  try {
    if (!rateLimit(`phone-login:${userId}`, 5, 10 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }
    return await startPhoneResponse(await req.json().catch(() => null), "link", userId);
  } catch (err) {
    return errorResponse(err, 400);
  }
});
