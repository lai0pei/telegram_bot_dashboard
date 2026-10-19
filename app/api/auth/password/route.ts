import { NextResponse } from "next/server";
import { withSession, errorResponse } from "@/lib/api-guard";
import { getLoginIdCookie } from "@/lib/auth";
import { loginStatusResponse } from "@/lib/login-response";
import { submitLoginPassword } from "@/lib/mtproto";

/** 2FA step for binding an extra Telegram account to the caller's dashboard user (see /api/auth/qr). */
export const POST = withSession(async (req, _ctx, userId) => {
  try {
    const { password } = await req.json();
    if (typeof password !== "string" || !password) {
      return NextResponse.json({ error: "Password is required." }, { status: 400 });
    }
    const loginId = await getLoginIdCookie();
    if (!loginId) {
      return NextResponse.json({ error: "No login in progress. Start again." }, { status: 400 });
    }

    const result = await submitLoginPassword(loginId, password, "link", userId);
    return loginStatusResponse(result);
  } catch (err) {
    return errorResponse(err, 400);
  }
});
