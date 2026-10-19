import { NextResponse } from "next/server";
import { withSession, errorResponse } from "@/lib/api-guard";
import { createSessionCookie, readSessionClaims } from "@/lib/auth";
import { logout } from "@/lib/mtproto";
import { getTelegramAccountById, pickDefaultTelegramAccountId } from "@/lib/telegram-accounts";
import { deleteBotRow, listBots } from "@/lib/bots";
import { deleteChatRow, listChats } from "@/lib/chats";
import { getUserById } from "@/lib/users";
import { singleFlight } from "@/lib/single-flight";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE: unbinds a Telegram account — ends its Telegram session (best-effort), removes its bots/chats/message history, and if it was the active account, re-signs the session cookie onto another one (or none). */
export const DELETE = withSession(async (_req: Request, ctx: Ctx, userId: string) => {
  try {
    const { id } = await ctx.params;
    const account = getTelegramAccountById(id);
    if (!account || account.ownerUserId !== userId) {
      return NextResponse.json({ error: "Telegram account not found." }, { status: 404 });
    }

    await singleFlight(`unbind-account:${id}`, async () => {
      // auth.LogOut is async; better-sqlite3 transactions are synchronous, so this runs first, outside one.
      await logout(id).catch(() => {});

      for (const bot of listBots(id)) deleteBotRow(bot.id);
      for (const chat of listChats(id)) deleteChatRow(chat.id);
    });

    const claims = await readSessionClaims();
    let newActiveTelegramAccountId: string | null = claims?.activeTelegramAccountId ?? null;
    if (newActiveTelegramAccountId === id) {
      newActiveTelegramAccountId = pickDefaultTelegramAccountId(userId);
      const user = getUserById(userId);
      await createSessionCookie(userId, user?.sessionVersion ?? 0, newActiveTelegramAccountId);
    }

    return NextResponse.json({ ok: true, newActiveTelegramAccountId });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
