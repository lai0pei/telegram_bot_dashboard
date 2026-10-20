import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-guard";
import { adminActionErrorResponse, deleteUserAndData } from "@/lib/admin-actions";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE `{ confirmName: string }`: removes a suspended user and their dashboard data. Master admin only; audited. */
export const DELETE = withAdmin(async (req: Request, ctx: Ctx, adminUserId: string) => {
  try {
    const body = await req.json().catch(() => null);
    if (typeof body?.confirmName !== "string") {
      return NextResponse.json({ error: "Type the user's name to confirm." }, { status: 400 });
    }
    await deleteUserAndData(adminUserId, (await ctx.params).id, body.confirmName);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return adminActionErrorResponse(err);
  }
});
