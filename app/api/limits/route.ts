import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { getAccountLimits } from "@/lib/limits";

/** GET: the active account's bot/channel/group/public-link counts against Telegram's limits (counts as of the last sync). */
export const GET = withAuth(async (_req, _ctx, telegramAccountId) => {
  try {
    return NextResponse.json(await getAccountLimits(telegramAccountId));
  } catch (err) {
    return errorResponse(err);
  }
});
