import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { getOverviewStats } from "@/lib/overview";

/** GET: counts and recent activity for the active Telegram account, from the local DB only (instant, no Telegram calls). */
export const GET = withAuth(async (_req, _ctx, telegramAccountId) => {
  try {
    return NextResponse.json((await getOverviewStats(telegramAccountId)));
  } catch (err) {
    return errorResponse(err);
  }
});
