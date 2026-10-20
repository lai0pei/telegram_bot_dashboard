import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { botApi } from "@/lib/botapi";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { loadBotChat, type BotChatParams } from "@/lib/bot-chat-route";
import { parseRights, rightsOf, statusOf, upsertBotChat } from "@/lib/bot-chats";
import { withLiveBotToken } from "@/lib/bots";

function serializeMember(m: { status: string; user: { id: number; first_name: string; username?: string } }) {
  return { userId: String(m.user.id), name: m.user.first_name, username: m.user.username ?? null, status: m.status };
}

/** GET: live details of a tracked chat (member count, description, admins), refreshing the bot's own rights there. */
export const GET = withAuth(async (_req: Request, ctx: BotChatParams, telegramAccountId: string) => {
  try {
    const loaded = await loadBotChat(ctx, telegramAccountId);
    if (loaded instanceof Response) return loaded;
    const { bot, chat } = loaded;

    const { result } = await withLiveBotToken(bot, telegramAccountId, async (token) => {
      const [info, memberCount, admins, me] = await Promise.all([
        botApi.getChat(token, chat.chatId),
        botApi.getChatMemberCount(token, chat.chatId).catch(() => null),
        botApi.getChatAdministrators(token, chat.chatId).catch(() => []),
        botApi.getChatMember(token, chat.chatId, Number(bot.telegramId)),
      ]);
      return { info, memberCount, admins, me };
    });

    const status = statusOf(result.me);
    const rights = rightsOf(result.me);
    await upsertBotChat(bot.id, {
      chatId: chat.chatId,
      type: chat.type,
      title: result.info.title ?? chat.title,
      username: result.info.username ?? null,
      status,
      rights,
    });

    return NextResponse.json({
      chatId: chat.chatId,
      type: chat.type,
      title: result.info.title ?? chat.title,
      username: result.info.username ?? null,
      description: result.info.description ?? "",
      inviteLink: result.info.invite_link ?? null,
      memberCount: result.memberCount,
      status,
      rights,
      admins: result.admins.map(serializeMember),
    });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err);
  }
});

/** PATCH { title?, description? }: renames the chat or edits its description (needs the "change info" right). */
export const PATCH = withAuth(async (req: Request, ctx: BotChatParams, telegramAccountId: string) => {
  try {
    const loaded = await loadBotChat(ctx, telegramAccountId);
    if (loaded instanceof Response) return loaded;
    const { bot, chat } = loaded;
    if (!parseRights(chat)?.canChangeInfo) {
      return NextResponse.json({ error: "The bot doesn't have the \"change info\" right in this chat." }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const title = typeof body?.title === "string" ? body.title.trim() : undefined;
    const description = typeof body?.description === "string" ? body.description : undefined;
    if (title === undefined && description === undefined) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    if (title !== undefined && (title.length < 1 || title.length > 128)) {
      return NextResponse.json({ error: "Title must be 1–128 characters." }, { status: 400 });
    }
    if (description !== undefined && description.length > 255) {
      return NextResponse.json({ error: "Description must be at most 255 characters." }, { status: 400 });
    }

    await withLiveBotToken(bot, telegramAccountId, async (token) => {
      if (title !== undefined && title !== chat.title) await botApi.setChatTitle(token, chat.chatId, title);
      if (description !== undefined) await botApi.setChatDescription(token, chat.chatId, description);
    });
    if (title !== undefined) {
      await upsertBotChat(bot.id, { chatId: chat.chatId, type: chat.type, title, username: chat.username, status: chat.status, rights: parseRights(chat) });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err);
  }
});
