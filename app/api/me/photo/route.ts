import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { getClient } from "@/lib/mtproto";
import { singleFlight } from "@/lib/single-flight";

/**
 * GET: the active Telegram account's own profile photo (small size), or 404
 * if it has none. Cached privately in the browser for an hour, keyed by
 * account in the URL (?a=<accountId>) so switching accounts doesn't show
 * the previous one's photo.
 */
export const GET = withAuth(async (_req, _ctx, telegramAccountId) => {
  try {
    const photo = await singleFlight(`me-photo:${telegramAccountId}`, async () => {
      const client = await getClient(telegramAccountId);
      return client ? client.downloadProfilePhoto("me", { isBig: false }) : undefined;
    });
    if (!Buffer.isBuffer(photo) || photo.length === 0) {
      return NextResponse.json({ error: "No profile photo." }, { status: 404 });
    }
    return new Response(new Uint8Array(photo), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" },
    });
  } catch (err) {
    return errorResponse(err);
  }
});
