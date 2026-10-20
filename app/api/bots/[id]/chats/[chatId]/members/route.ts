import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { botApi } from "@/lib/botapi";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { loadBotChat, type BotChatParams } from "@/lib/bot-chat-route";
import { parseRights, type BotRights } from "@/lib/bot-chats";
import { withLiveBotToken } from "@/lib/bots";

const ACTIONS = {
  ban: "canRestrictMembers",
  unban: "canRestrictMembers",
  restrict: "canRestrictMembers",
  unrestrict: "canRestrictMembers",
  promote: "canPromoteMembers",
  demote: "canPromoteMembers",
} as const satisfies Record<string, keyof BotRights>;
type MemberAction = keyof typeof ACTIONS;

const RIGHT_LABELS: Record<keyof BotRights, string> = {
  canChangeInfo: "change info",
  canInviteUsers: "invite users",
  canRestrictMembers: "ban users",
  canPromoteMembers: "add admins",
  canPinMessages: "pin messages",
  canDeleteMessages: "delete messages",
};

const DURATIONS_S = { "1h": 3600, "1d": 86_400, "1w": 604_800 } as const;

/**
 * POST { userId, action, duration?, revokeMessages? }: ban / unban / restrict (read-only) / unrestrict / promote
 * (basic rights) / demote a member. `duration` ("1h" | "1d" | "1w") makes a restriction temporary; `revokeMessages`
 * also deletes a banned user's messages.
 */
export const POST = withAuth(async (req: Request, ctx: BotChatParams, telegramAccountId: string) => {
  try {
    const loaded = await loadBotChat(ctx, telegramAccountId);
    if (loaded instanceof Response) return loaded;
    const { bot, chat } = loaded;

    const body = await req.json().catch(() => null);
    const action = body?.action as MemberAction;
    if (!(action in ACTIONS)) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    const userIdText = typeof body?.userId === "string" ? body.userId.trim() : String(body?.userId ?? "");
    if (!/^\d{1,15}$/.test(userIdText)) return NextResponse.json({ error: "userId must be a Telegram user ID." }, { status: 400 });
    if (userIdText === bot.telegramId) return NextResponse.json({ error: "That's the bot itself." }, { status: 400 });
    const userId = Number(userIdText);

    const duration = body?.duration;
    if (duration !== undefined && duration !== null && duration !== "") {
      if (action !== "restrict" || !(duration in DURATIONS_S)) {
        return NextResponse.json({ error: "A duration only applies to making someone read-only: 1h, 1d or 1w." }, { status: 400 });
      }
    }
    const untilDate = duration && duration in DURATIONS_S ? Math.floor(Date.now() / 1000) + DURATIONS_S[duration as keyof typeof DURATIONS_S] : undefined;
    const revokeMessages = action === "ban" && body?.revokeMessages === true;

    const needed = ACTIONS[action];
    if (!parseRights(chat)?.[needed]) {
      return NextResponse.json({ error: `The bot doesn't have the "${RIGHT_LABELS[needed]}" right in this chat.` }, { status: 403 });
    }
    if (chat.type === "channel" && (action === "restrict" || action === "unrestrict")) {
      return NextResponse.json({ error: "Channel subscribers can be banned, but not restricted." }, { status: 400 });
    }

    await withLiveBotToken(bot, telegramAccountId, (token) => {
      switch (action) {
        case "ban":
          return botApi.banChatMember(token, chat.chatId, userId, revokeMessages);
        case "unban":
          return botApi.unbanChatMember(token, chat.chatId, userId);
        case "restrict":
          return botApi.restrictChatMember(token, chat.chatId, userId, false, untilDate);
        case "unrestrict":
          return botApi.restrictChatMember(token, chat.chatId, userId, true);
        case "promote":
          return botApi.promoteChatMember(token, chat.chatId, userId, true);
        case "demote":
          return botApi.promoteChatMember(token, chat.chatId, userId, false);
      }
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err);
  }
});
