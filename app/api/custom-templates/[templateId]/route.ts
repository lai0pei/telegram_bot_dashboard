import { NextResponse } from "next/server";
import { withSession, errorResponse } from "@/lib/api-guard";
import { deleteCustomTemplate } from "@/lib/custom-templates";

type Ctx = { params: Promise<{ templateId: string }> };

/** DELETE — removes a saved template (only the owner's; bots that already used it keep what it added). */
export const DELETE = withSession(async (_req: Request, ctx: Ctx, userId: string) => {
  try {
    const n = Number((await ctx.params).templateId);
    if (!Number.isInteger(n) || !deleteCustomTemplate(userId, n)) return NextResponse.json({ error: "Template not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
