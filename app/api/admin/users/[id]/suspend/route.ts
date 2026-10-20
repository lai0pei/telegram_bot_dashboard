import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-guard";
import { adminActionErrorResponse, setUserSuspended } from "@/lib/admin-actions";

type Ctx = { params: Promise<{ id: string }> };

/** POST `{ suspended: boolean }`: suspends or restores a user. Master admin only; audited. */
export const POST = withAdmin(async (req: Request, ctx: Ctx, adminUserId: string) => {
  try {
    const body = await req.json().catch(() => null);
    if (typeof body?.suspended !== "boolean") {
      return NextResponse.json({ error: "`suspended` must be true or false." }, { status: 400 });
    }
    await setUserSuspended(adminUserId, (await ctx.params).id, body.suspended);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return adminActionErrorResponse(err);
  }
});
