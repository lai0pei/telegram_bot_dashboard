import { NextResponse } from "next/server";
import { withSession, errorResponse } from "@/lib/api-guard";
import { getTelegramAccountById } from "@/lib/telegram-accounts";
import { sendDigestNow } from "@/lib/digest";

type Ctx = { params: Promise<{ id: string }> };

/** POST: sends this account's digest to its own Saved Messages right now, regardless of its schedule. */
export const POST = withSession(async (_req: Request, ctx: Ctx, userId: string) => {
  try {
    const { id } = await ctx.params;
    const account = getTelegramAccountById(id);
    if (!account || account.ownerUserId !== userId) {
      return NextResponse.json({ error: "Telegram account not found." }, { status: 404 });
    }
    if (account.revokedAt) {
      return NextResponse.json({ error: "This account's Telegram session has ended." }, { status: 409 });
    }

    await sendDigestNow(account);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
