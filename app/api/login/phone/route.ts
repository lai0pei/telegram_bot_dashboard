import { withRateLimit, errorResponse } from "@/lib/api-guard";
import { startPhoneResponse } from "@/lib/phone-login-response";

/**
 * Dashboard sign-in by phone number + Telegram code, the alternative to the QR scan (/api/login/qr).
 * Unauthenticated and it makes Telegram message the number, so it is tightly limited per IP (and per number in startPhoneLogin).
 * The code step is /api/login/phone/code; 2FA then continues at /api/login/password.
 */
export const POST = withRateLimit(
  async (req) => {
    try {
      return await startPhoneResponse(await req.json().catch(() => null), "signin");
    } catch (err) {
      return errorResponse(err, 400);
    }
  },
  { key: "login-phone-start", limit: 5, windowMs: 10 * 60 * 1000 }
);
