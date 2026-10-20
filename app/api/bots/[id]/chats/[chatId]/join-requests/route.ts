import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { BotApiError, botApi } from "@/lib/botapi";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { loadBotChat, type BotChatParams } from "@/lib/bot-chat-route";
import { parseRights } from "@/lib/bot-chats";
import { withLiveBotToken } from "@/lib/bots";
import { listPendingJoinRequests, setJoinRequestStatus } from "@/lib/join-requests";

/** GET: people waiting to join this chat through an approval-required invite link (recorded while monitoring is on). */
export const GET = withAuth(async (_req: Request, ctx: BotChatParams, telegramAccountId: string) => {
  try {
    const loaded = await loadBotChat(ctx, telegramAccountId);
    if (loaded instanceof Response) return loaded;
    const requests = listPendingJoinRequests(loaded.bot.id, loaded.chat.chatId).map((r) => ({
      userId: r.userId,
      username: r.username,
      firstName: r.firstName,
      bio: r.bio,
      requestedAt: r.requestedAt,
    }));
    return NextResponse.json({ requests });
  } catch (err) {
    return errorResponse(err);
  }
});

/** POST { userId, action: "approve" | "decline" } */
export const POST = withAuth(async (req: Request, ctx: BotChatParams, telegramAccountId: string) => {
  try {
    const loaded = await loadBotChat(ctx, telegramAccountId);
    if (loaded instanceof Response) return loaded;
    const { bot, chat } = loaded;
    if (!parseRights(chat)?.canInviteUsers) {
      return NextResponse.json({ error: "The bot doesn't have the \"invite users\" right in this chat." }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const action = body?.action;
    const userIdText = typeof body?.userId === "string" ? body.userId.trim() : String(body?.userId ?? "");
    if (action !== "approve" && action !== "decline") return NextResponse.json({ error: "action must be approve or decline." }, { status: 400 });
    if (!/^\d{1,15}$/.test(userIdText)) return NextResponse.json({ error: "userId must be a Telegram user ID." }, { status: 400 });

    const status = action === "approve" ? "approved" : "declined";
    try {
      await withLiveBotToken(bot, telegramAccountId, (token) =>
        action === "approve"
          ? botApi.approveChatJoinRequest(token, chat.chatId, Number(userIdText))
          : botApi.declineChatJoinRequest(token, chat.chatId, Number(userIdText))
      );
    } catch (err) {
      // Someone (or the user, by cancelling) already handled it: drop it from the pending list too.
      if (err instanceof BotApiError && /HIDE_REQUESTER_MISSING|USER_ALREADY_PARTICIPANT/i.test(err.description)) {
        setJoinRequestStatus(bot.id, chat.chatId, userIdText, status);
        return NextResponse.json({ error: "That request was already handled or withdrawn." }, { status: 422 });
      }
      throw err;
    }
    setJoinRequestStatus(bot.id, chat.chatId, userIdText, status);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err);
  }
});
