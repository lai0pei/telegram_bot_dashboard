import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { withRateLimit, errorResponse } from "@/lib/api-guard";
import { getLoginIdCookie, setLoginIdCookie } from "@/lib/auth";
import { loginStatusResponse } from "@/lib/login-response";
import { pollQrLogin, startQrLogin } from "@/lib/mtproto";

/**
 * Dashboard sign-in by Telegram QR scan (no dashboard account/password —
 * see lib/mtproto.ts finishLogin for how the dashboard user is resolved or
 * created). Unauthenticated, so it's rate-limited per IP instead of
 * withSession's per-user key.
 */
export const POST = withRateLimit(
  async () => {
    try {
      const { loginId } = await startQrLogin("signin");
      await setLoginIdCookie(loginId);
      return NextResponse.json({ ok: true });
    } catch (err) {
      return errorResponse(err, 400);
    }
  },
  { key: "login-qr-start", limit: 20, windowMs: 10 * 60 * 1000 }
);

/**
 * Polled every 2s by the wizard: returns the current QR image while waiting,
 * or the login's outcome once scanned. Deliberately not rate-limited — a poll
 * only reads in-memory state (plus one Telegram call when the ~30s token
 * expires), and only a holder of the login-ID cookie gets anything back.
 * Starting a login (POST) is what's limited.
 */
export async function GET() {
  try {
    const loginId = await getLoginIdCookie();
    if (!loginId) {
      return NextResponse.json({ error: "No login in progress. Start again." }, { status: 400 });
    }

    const result = await pollQrLogin(loginId, "signin");
    if (result.status === "waiting") {
      const qrDataUrl = await QRCode.toDataURL(result.qrUrl, { margin: 1, width: 240 });
      return NextResponse.json({ status: "waiting", qrDataUrl, expiresAt: result.expiresAt });
    }
    return loginStatusResponse(result);
  } catch (err) {
    return errorResponse(err, 400);
  }
}
