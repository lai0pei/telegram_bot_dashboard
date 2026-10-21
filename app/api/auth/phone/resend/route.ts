import { NextResponse } from "next/server";
import { withSession, errorResponse } from "@/lib/api-guard";
import { resendCodeResponse } from "@/lib/phone-login-response";
import { rateLimit } from "@/lib/rate-limit";

/** Asks Telegram to resend the code when binding an extra account by phone (see /api/auth/phone). */
export const POST = withSession(async (_req, _ctx, userId) => {
  try {
    if (!rateLimit(`phone-resend:${userId}`, 5, 10 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }
    return await resendCodeResponse("link", userId);
  } catch (err) {
    return errorResponse(err, 400);
  }
});
