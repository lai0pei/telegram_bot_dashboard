import { withRateLimit, errorResponse } from "@/lib/api-guard";
import { submitCodeResponse } from "@/lib/phone-login-response";

/** Code step of the phone sign-in (see /api/login/phone). Unauthenticated, rate-limited per IP; wrong codes are also capped per login. */
export const POST = withRateLimit(
  async (req) => {
    try {
      return await submitCodeResponse(await req.json().catch(() => null), "signin");
    } catch (err) {
      return errorResponse(err, 400);
    }
  },
  { key: "login-phone-code", limit: 20, windowMs: 10 * 60 * 1000 }
);
