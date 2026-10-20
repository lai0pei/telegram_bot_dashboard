import { NextResponse } from "next/server";
import { withSession, errorResponse } from "@/lib/api-guard";
import { getAttentionItems } from "@/lib/attention";

/** GET: everything across all of this dashboard user's linked Telegram accounts that needs a look — from the local DB only. */
export const GET = withSession(async (_req, _ctx, userId) => {
  try {
    return NextResponse.json({ items: (await getAttentionItems(userId)) });
  } catch (err) {
    return errorResponse(err);
  }
});
