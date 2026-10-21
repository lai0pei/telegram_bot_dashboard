import { withRateLimit, errorResponse } from "@/lib/api-guard";
import { resendCodeResponse } from "@/lib/phone-login-response";

/** Asks Telegram to resend the phone sign-in code (see /api/login/phone). */
export const POST = withRateLimit(
  async () => {
    try {
      return await resendCodeResponse("signin");
    } catch (err) {
      return errorResponse(err, 400);
    }
  },
  { key: "login-phone-resend", limit: 5, windowMs: 10 * 60 * 1000 }
);
