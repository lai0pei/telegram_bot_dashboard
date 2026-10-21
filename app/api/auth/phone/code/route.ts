import { withSession, errorResponse } from "@/lib/api-guard";
import { submitCodeResponse } from "@/lib/phone-login-response";

/** Code step of binding an extra Telegram account by phone (see /api/auth/phone). */
export const POST = withSession(async (req, _ctx, userId) => {
  try {
    return await submitCodeResponse(await req.json().catch(() => null), "link", userId);
  } catch (err) {
    return errorResponse(err, 400);
  }
});
