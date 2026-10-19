import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { withSession, errorResponse } from "@/lib/api-guard";
import { getLoginIdCookie, setLoginIdCookie } from "@/lib/auth";
import { loginStatusResponse } from "@/lib/login-response";
import { pollQrLogin, startQrLogin } from "@/lib/mtproto";
import { rateLimit } from "@/lib/rate-limit";

/** Starts binding an extra Telegram account to the caller's dashboard user. Shares the login-ID cookie with the password step, so 2FA continues at /api/auth/password. */
export const POST = withSession(async (_req, _ctx, userId) => {
  try {
    if (!rateLimit(`qr-login:${userId}`, 10, 10 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }
    const { loginId } = await startQrLogin("link", userId);
    await setLoginIdCookie(loginId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 400);
  }
});

/** Polled by the wizard: returns the current QR image while waiting, or the login's outcome once scanned. */
export const GET = withSession(async (_req, _ctx, userId) => {
  try {
    const loginId = await getLoginIdCookie();
    if (!loginId) {
      return NextResponse.json({ error: "No login in progress. Start again." }, { status: 400 });
    }

    const result = await pollQrLogin(loginId, "link", userId);
    if (result.status === "waiting") {
      const qrDataUrl = await QRCode.toDataURL(result.qrUrl, { margin: 1, width: 240 });
      return NextResponse.json({ status: "waiting", qrDataUrl, expiresAt: result.expiresAt });
    }
    return loginStatusResponse(result);
  } catch (err) {
    return errorResponse(err, 400);
  }
});
