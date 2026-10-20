import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-guard";
import { adminActionErrorResponse, signOutUser } from "@/lib/admin-actions";

type Ctx = { params: Promise<{ id: string }> };

/** POST: signs the user out of every browser (their Telegram sessions are untouched). Master admin only; audited. */
export const POST = withAdmin(async (_req: Request, ctx: Ctx, adminUserId: string) => {
  try {
    await signOutUser(adminUserId, (await ctx.params).id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return adminActionErrorResponse(err);
  }
});
