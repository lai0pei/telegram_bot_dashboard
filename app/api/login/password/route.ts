import { NextResponse } from "next/server";
import { withRateLimit, errorResponse } from "@/lib/api-guard";
import { getLoginIdCookie } from "@/lib/auth";
import { loginStatusResponse } from "@/lib/login-response";
import { submitLoginPassword } from "@/lib/mtproto";

/** 2FA step for dashboard sign-in by QR scan (see /api/login/qr). Unauthenticated, rate-limited per IP. */
export const POST = withRateLimit(
  async (req) => {
    try {
      const { password } = await req.json();
      if (typeof password !== "string" || !password) {
        return NextResponse.json({ error: "Password is required." }, { status: 400 });
      }
      const loginId = await getLoginIdCookie();
      if (!loginId) {
        return NextResponse.json({ error: "No login in progress. Start again." }, { status: 400 });
      }

      const result = await submitLoginPassword(loginId, password, "signin");
      return loginStatusResponse(result);
    } catch (err) {
      return errorResponse(err, 400);
    }
  },
  { key: "login-password", limit: 20, windowMs: 10 * 60 * 1000 }
);
