import { NextResponse } from "next/server";
import { withSession, errorResponse } from "@/lib/api-guard";
import { createSessionCookie } from "@/lib/auth";
import { getTelegramAccountById } from "@/lib/telegram-accounts";
import { getUserById } from "@/lib/users";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withSession(async (_req: Request, ctx: Ctx, userId: string) => {
  try {
    const { id } = await ctx.params;
    const account = getTelegramAccountById(id);
    if (!account || account.ownerUserId !== userId) {
      return NextResponse.json({ error: "Telegram account not found." }, { status: 404 });
    }
    if (account.revokedAt) {
      return NextResponse.json(
        { error: "This account's session was ended from another device. Scan a QR code to link it again." },
        { status: 409 }
      );
    }
    const user = getUserById(userId);
    await createSessionCookie(userId, user?.sessionVersion ?? 0, account.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
