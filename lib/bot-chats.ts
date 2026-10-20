import { and, eq } from "drizzle-orm";
import { botApi, type BotApiChat, type ChatMember } from "./botapi";
import { withLiveBotToken, type BotRow } from "./bots";
import { db } from "./db";
import { botChats } from "./db/schema";

export type BotChatRow = typeof botChats.$inferSelect;
export type BotChatStatus = BotChatRow["status"];
export type BotChatType = BotChatRow["type"];

/** What the bot itself may do in a chat, derived from its member record. Creators can do everything. */
export interface BotRights {
  canChangeInfo: boolean;
  canInviteUsers: boolean;
  canRestrictMembers: boolean;
  canPromoteMembers: boolean;
  canPinMessages: boolean;
  canDeleteMessages: boolean;
}

export function rightsOf(member: ChatMember): BotRights {
  const all = member.status === "creator";
  return {
    canChangeInfo: all || Boolean(member.can_change_info),
    canInviteUsers: all || Boolean(member.can_invite_users),
    canRestrictMembers: all || Boolean(member.can_restrict_members),
    canPromoteMembers: all || Boolean(member.can_promote_members),
    canPinMessages: all || Boolean(member.can_pin_messages),
    canDeleteMessages: all || Boolean(member.can_delete_messages),
  };
}

export function parseRights(row: Pick<BotChatRow, "rights">): BotRights | null {
  if (!row.rights) return null;
  try {
    return JSON.parse(row.rights) as BotRights;
  } catch {
    return null;
  }
}

/** creator/administrator/member/restricted(still inside) map to the dashboard's statuses; anything else is "left". */
export function statusOf(member: ChatMember): BotChatStatus {
  if (member.status === "creator" || member.status === "administrator") return "administrator";
  if (member.status === "member") return "member";
  if (member.status === "restricted") return member.is_member === false ? "left" : "member";
  return member.status === "kicked" ? "kicked" : "left";
}

/** Bot API chat types the dashboard tracks (private chats are contacts, not chats). */
export function trackedType(type: string): BotChatType | null {
  return type === "group" || type === "supergroup" || type === "channel" ? type : null;
}

export function listBotChats(botId: number): BotChatRow[] {
  return db.select().from(botChats).where(eq(botChats.botId, botId)).all();
}

/** Scoped to the bot, so a chat that belongs to another bot returns undefined (-> 404). */
export function getBotChat(botId: number, chatId: string): BotChatRow | undefined {
  return db
    .select()
    .from(botChats)
    .where(and(eq(botChats.botId, botId), eq(botChats.chatId, chatId)))
    .all()[0];
}

export function upsertBotChat(
  botId: number,
  info: {
    chatId: string;
    type: BotChatType;
    title: string;
    username?: string | null;
    status: BotChatStatus;
    rights?: BotRights | null;
  }
): void {
  const now = new Date();
  const values = {
    type: info.type,
    title: info.title,
    username: info.username ?? null,
    status: info.status,
    rights: info.rights ? JSON.stringify(info.rights) : null,
    updatedAt: now,
  };
  db.insert(botChats)
    .values({ botId, chatId: info.chatId, ...values })
    .onConflictDoUpdate({ target: [botChats.botId, botChats.chatId], set: values })
    .run();
}

/** A group/channel message proves the bot is in that chat; record it without overriding a known status/rights. */
export function noteBotChatFromMessage(botId: number, chat: { id: number; type: string; title?: string; username?: string }): void {
  const type = trackedType(chat.type);
  if (!type) return;
  const existing = getBotChat(botId, String(chat.id));
  if (existing && (existing.status === "member" || existing.status === "administrator")) {
    if (chat.title && chat.title !== existing.title) {
      db.update(botChats).set({ title: chat.title, updatedAt: new Date() }).where(eq(botChats.id, existing.id)).run();
    }
    return;
  }
  upsertBotChat(botId, {
    chatId: String(chat.id),
    type,
    title: chat.title ?? String(chat.id),
    username: chat.username ?? null,
    status: "member",
    rights: existing ? parseRights(existing) : null,
  });
}

export class NotAChatError extends Error {}

/**
 * Reads the chat and the bot's own membership from Telegram and stores them. Returns null (storing nothing) when the
 * bot isn't in the chat. `chatRef` is a numeric chat ID or an @username of a public channel/supergroup.
 */
export async function refreshBotChat(bot: BotRow, telegramAccountId: string, chatRef: string): Promise<BotChatRow | null> {
  const botUserId = Number(bot.telegramId);
  const { result } = await withLiveBotToken(bot, telegramAccountId, async (token) => {
    const chat: BotApiChat = await botApi.getChat(token, chatRef);
    const member = await botApi.getChatMember(token, chat.id, botUserId);
    return { chat, member };
  });
  const type = trackedType(result.chat.type);
  if (!type) throw new NotAChatError("That's a private chat. Private chats are listed under the Messages tab.");
  const status = statusOf(result.member);
  if (status === "left" || status === "kicked") return null;
  upsertBotChat(bot.id, {
    chatId: String(result.chat.id),
    type,
    title: result.chat.title ?? String(result.chat.id),
    username: result.chat.username ?? null,
    status,
    rights: rightsOf(result.member),
  });
  return getBotChat(bot.id, String(result.chat.id)) ?? null;
}
