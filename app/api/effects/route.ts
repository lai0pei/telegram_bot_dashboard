import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { getMessageEffects } from "@/lib/effects";

/** GET: the message effects Telegram offers (empty when unavailable). Same list for every bot of the active account. */
export const GET = withAuth(async (_req: Request, _ctx: unknown, telegramAccountId: string) => {
  try {
    return NextResponse.json({ effects: await getMessageEffects(telegramAccountId) });
  } catch (err) {
    return errorResponse(err);
  }
});
