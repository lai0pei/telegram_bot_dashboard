import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { botApi } from "@/lib/botapi";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { loadBotChat, type BotChatParams } from "@/lib/bot-chat-route";
import { parseRights } from "@/lib/bot-chats";
import { withLiveBotToken } from "@/lib/bots";

/**
 * POST { action: "export" | "create" | "revoke", name?, link?, createsJoinRequest? }.
 * export replaces the chat's primary link with a new one, create adds an extra link, revoke kills a link.
 */
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
    if (action === "export") {
      const { result } = await withLiveBotToken(bot, telegramAccountId, (token) => botApi.exportChatInviteLink(token, chat.chatId));
      return NextResponse.json({ link: result });
    }
    if (action === "create") {
      const name = typeof body?.name === "string" ? body.name.trim().slice(0, 32) : undefined;
      // A link that needs approval turns each use into a join request the bot is told about (see the join-requests route).
      const createsJoinRequest = body?.createsJoinRequest === true;
      const { result } = await withLiveBotToken(bot, telegramAccountId, (token) =>
        botApi.createChatInviteLink(token, chat.chatId, name, createsJoinRequest)
      );
      return NextResponse.json({ link: result.invite_link });
    }
    if (action === "revoke") {
      const link = body?.link;
      if (typeof link !== "string" || !/^https:\/\/t\.me\/\S+$/.test(link)) {
        return NextResponse.json({ error: "A t.me invite link is required." }, { status: 400 });
      }
      await withLiveBotToken(bot, telegramAccountId, (token) => botApi.revokeChatInviteLink(token, chat.chatId, link));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "action must be export, create or revoke." }, { status: 400 });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err);
  }
});
