import { NextResponse } from "next/server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { getBotById, withLiveBotToken } from "@/lib/bots";
import { db } from "@/lib/db";
import { botMessages, botUsers } from "@/lib/db/schema";
import { botApi, isPrivateChatId, type MediaMethod, type ParseMode, type SendOptions } from "@/lib/botapi";
import { getBusinessConnection, parseBusinessRights } from "@/lib/business";
import { listBotChats } from "@/lib/bot-chats";
import { upsertBotUser } from "@/lib/bot-users";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { pickMediaMethod, toMessageRow } from "@/lib/messages";
import { recordOutgoing } from "@/lib/outgoing";
import {
  validateBotUpload,
  validateCaption,
  validateChatId,
  validateMessageText,
  validateParseMode,
  hasInlineButtons,
  normalizeInlineButtons,
  normalizeReplyKeyboard,
  validateEffectId,
  validateInlineButtons,
  validateReplyKeyboard,
} from "@/lib/validation";

const MEDIA_LABELS: Record<string, string> = {
  photo: "Photo",
  document: "File",
  video: "Video",
  audio: "Audio",
  voice: "Voice message",
  sticker: "Sticker",
  poll: "Poll",
  other: "Attachment",
};

interface Conversation {
  /** Identifies the conversation in the list: the chat ID, or `chatId|connectionId` for a business chat. */
  key: string;
  chatId: string;
  /** Set for chats of a connected Telegram Business account (their IDs can repeat the bot's own chats). */
  connectionId: string | null;
  name: string;
  lastText: string | null;
  lastAt: number;
  count: number;
}

/**
 * GET: conversations (one per chat, and one per business chat) + unique user count. With ?chatId= (and
 * ?connectionId= for a business chat), also the messages of that chat, oldest first (the newest `limit` of them).
 */
export const GET = withAuth(async (req: Request, ctx: { params: Promise<{ id: string }> }, userId: string) => {
  try {
    const { id } = await ctx.params;
    const botId = Number(id);
    const bot = getBotById(botId, userId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });

    const url = new URL(req.url);
    const chatId = url.searchParams.get("chatId");
    const connectionId = url.searchParams.get("connectionId") || null;
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 200) || 200, 500);

    const users = db.select().from(botUsers).where(eq(botUsers.botId, botId)).all();
    const userNames = new Map(users.map((u) => [u.chatId, u.firstName || (u.username ? `@${u.username}` : null)]));
    // Group/channel conversations have no contact row: use the chat title.
    for (const c of listBotChats(botId)) if (!userNames.get(c.chatId)) userNames.set(c.chatId, c.title);

    // One row per chat (and per business connection, since a business chat can share its ID with a direct one):
    // its newest message (same ordering the chat pane uses) plus the count. `bc` is '' for direct chats.
    const rows = db.all<{
      chat_id: string;
      bc: string;
      text: string | null;
      media_type: string | null;
      created_at: number;
      cnt: number;
      peer: string | null;
    }>(sql`
      SELECT m.chat_id, coalesce(m.business_connection_id, '') AS bc, m.text, m.media_type, m.created_at, c.cnt,
        (SELECT x.from_first_name FROM bot_messages x
          WHERE x.bot_id = ${botId} AND x.chat_id = m.chat_id AND x.direction = 'in'
            AND coalesce(x.business_connection_id, '') = coalesce(m.business_connection_id, '')
          ORDER BY x.id DESC LIMIT 1) AS peer
      FROM bot_messages m
      JOIN (
        SELECT chat_id, coalesce(business_connection_id, '') AS bc, count(*) AS cnt
        FROM bot_messages WHERE bot_id = ${botId} GROUP BY chat_id, coalesce(business_connection_id, '')
      ) c ON c.chat_id = m.chat_id AND c.bc = coalesce(m.business_connection_id, '')
      WHERE m.bot_id = ${botId}
        AND m.id = (
          SELECT id FROM bot_messages
          WHERE bot_id = ${botId} AND chat_id = m.chat_id
            AND coalesce(business_connection_id, '') = coalesce(m.business_connection_id, '')
          ORDER BY created_at DESC, id DESC LIMIT 1
        )`);

    const byChat = new Map<string, Conversation>();
    for (const r of rows) {
      const connection = r.bc || null;
      const key = connection ? `${r.chat_id}|${connection}` : r.chat_id;
      byChat.set(key, {
        key,
        chatId: r.chat_id,
        connectionId: connection,
        name: connection ? (r.peer ?? r.chat_id) : (userNames.get(r.chat_id) ?? r.chat_id),
        lastText: r.text ?? (r.media_type ? MEDIA_LABELS[r.media_type] ?? "Attachment" : null),
        lastAt: r.created_at,
        count: r.cnt,
      });
    }
    // Contacts who have written to the bot but whose messages were all deleted still get a (empty) entry.
    for (const u of users) {
      if (!byChat.has(u.chatId)) {
        byChat.set(u.chatId, {
          key: u.chatId,
          chatId: u.chatId,
          connectionId: null,
          name: userNames.get(u.chatId) ?? u.chatId,
          lastText: null,
          lastAt: u.lastSeenAt.getTime(),
          count: 0,
        });
      }
    }
    const conversations = [...byChat.values()].sort((a, b) => b.lastAt - a.lastAt);

    const messages = chatId
      ? db
          .select()
          .from(botMessages)
          .where(
            and(
              eq(botMessages.botId, botId),
              eq(botMessages.chatId, chatId),
              connectionId ? eq(botMessages.businessConnectionId, connectionId) : isNull(botMessages.businessConnectionId)
            )
          )
          .orderBy(desc(botMessages.createdAt), desc(botMessages.id))
          .limit(limit)
          .all()
          .reverse()
          .map(toMessageRow)
      : [];

    const contacts = users.map((u) => ({ chatId: u.chatId, name: userNames.get(u.chatId) ?? u.chatId }));

    return NextResponse.json({ conversations, messages, contacts, uniqueUserCount: users.length });
  } catch (err) {
    return errorResponse(err);
  }
});

/** POST: send a reply. Body: { chatId: string, text: string } */
export const POST = withAuth(async (req: Request, ctx: { params: Promise<{ id: string }> }, userId: string) => {
  try {
    const { id } = await ctx.params;
    const bot = getBotById(Number(id), userId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });

    const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

    // JSON { chatId, text, parseMode?, replyTo?, buttons? } for text, or multipart { chatId, file, caption?, parseMode?, replyTo?, asFile? } for media.
    const isMultipart = (req.headers.get("content-type") ?? "").startsWith("multipart/form-data");
    let chatId: unknown, text: unknown, parseMode: unknown, replyTo: unknown, buttons: unknown, replyKeyboard: unknown, effectId: unknown, businessConnectionId: unknown;
    let upload: File | null = null;
    let asFile = false;
    if (isMultipart) {
      const form = await req.formData().catch(() => null);
      if (!form) return bad("Invalid form data.");
      chatId = form.get("chatId");
      text = form.get("caption") ?? "";
      parseMode = form.get("parseMode") || undefined;
      replyTo = form.get("replyTo") || undefined;
      effectId = form.get("effectId") || undefined;
      businessConnectionId = form.get("businessConnectionId") || undefined;
      asFile = form.get("asFile") === "true";
      const file = form.get("file");
      if (!(file instanceof File)) return bad("A file is required.");
      upload = file;
    } else {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return bad("Invalid JSON body.");
      }
      ({ chatId, text, parseMode, replyTo, buttons, replyKeyboard, effectId, businessConnectionId } = body);
    }

    if (typeof chatId !== "string" || typeof text !== "string") return bad("chatId and text are required.");
    const chatIdError = validateChatId(chatId);
    if (chatIdError) return bad(chatIdError);
    const parseModeError = validateParseMode(parseMode);
    if (parseModeError) return bad(parseModeError);
    const buttonsError = validateInlineButtons(buttons, chatId);
    if (buttonsError) return bad(buttonsError);
    const effectError = validateEffectId(effectId, chatId);
    if (effectError) return bad(effectError);
    const keyboardError = validateReplyKeyboard(replyKeyboard);
    if (keyboardError) return bad(keyboardError);
    const keyboard = normalizeReplyKeyboard(replyKeyboard) ?? undefined;
    if (keyboard) {
      if (upload) return bad("A reply keyboard can only go with a text message, not a file.");
      if (hasInlineButtons(buttons)) return bad("Use inline buttons or a reply keyboard, not both.");
      const asksForData = keyboard.kind === "keyboard" && keyboard.rows.flat().some((b) => b.request_contact || b.request_location);
      if (asksForData && !isPrivateChatId(chatId)) return bad("Contact and location buttons only work in private chats.");
    }
    // Replying as a connected business account: the connection must be this bot's, enabled, and allow replies.
    let connectionId: string | undefined;
    if (businessConnectionId !== undefined && businessConnectionId !== null && businessConnectionId !== "") {
      if (typeof businessConnectionId !== "string") return bad("Invalid business connection.");
      const connection = getBusinessConnection(bot.id, businessConnectionId);
      if (!connection) return bad("That business connection doesn't belong to this bot.");
      if (!connection.isEnabled) return NextResponse.json({ error: "That business connection is turned off." }, { status: 422 });
      if (!parseBusinessRights(connection).can_reply) {
        return NextResponse.json({ error: "The business account didn't allow this bot to reply in its chats." }, { status: 422 });
      }
      if (keyboard || effectId) return bad("Reply keyboards and message effects aren't supported in business chats.");
      // Per the Bot API, Mini App and inline-query buttons are not supported for messages sent on behalf of a business account.
      const buttonJson = JSON.stringify(buttons ?? null);
      if (buttonJson.includes('"web_app"') || buttonJson.includes('"switch_inline_query')) {
        return bad("Mini App and inline-query buttons aren't supported in business chats.");
      }
      connectionId = businessConnectionId;
    }
    const replyToId = replyTo === undefined || replyTo === null || replyTo === "" ? undefined : Number(replyTo);
    if (replyToId !== undefined && (!Number.isInteger(replyToId) || replyToId <= 0)) return bad("Invalid reply target.");

    const opts: SendOptions = {
      parseMode: (parseMode || undefined) as ParseMode | undefined,
      replyToMessageId: replyToId,
      buttons: normalizeInlineButtons(buttons) ?? undefined,
      replyKeyboard: keyboard,
      effectId: typeof effectId === "string" && effectId ? effectId : undefined,
      businessConnectionId: connectionId,
    };

    let send: (token: string) => Promise<Awaited<ReturnType<typeof botApi.sendMessage>>>;
    if (upload) {
      const uploadError = validateBotUpload(upload) ?? validateCaption(text);
      if (uploadError) return bad(uploadError);
      const method: MediaMethod = pickMediaMethod(upload.type, upload.size, asFile);
      const data = Buffer.from(await upload.arrayBuffer());
      const file = { name: upload.name || "file", type: upload.type || "application/octet-stream", data };
      send = (token) => botApi.sendMedia(token, method, chatId as string, file, text, opts);
    } else {
      const textError = validateMessageText(text);
      if (textError) return bad(textError);
      send = (token) => botApi.sendMessage(token, chatId as string, text as string, opts);
    }

    const { result: sent } = await withLiveBotToken(bot, userId, send);

    // A private chat's name comes back with the sent message: fills in contacts added by a manual chat ID.
    // Groups/channels are skipped so they don't count as "people who wrote to the bot".
    if (sent.chat.type === "private" && !connectionId) {
      upsertBotUser(bot.id, String(sent.chat.id), {
        username: sent.chat.username ?? null,
        firstName: sent.chat.first_name ?? null,
        touch: false,
      });
    }

    const row = recordOutgoing(bot.id, sent, replyToId, connectionId);

    return NextResponse.json({ message: toMessageRow(row) });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err);
  }
});

/** DELETE ?chatId=X: clears one conversation from the dashboard (local only; Telegram has no "clear history" for bots). */
export const DELETE = withAuth(async (req: Request, ctx: { params: Promise<{ id: string }> }, userId: string) => {
  try {
    const { id } = await ctx.params;
    const bot = getBotById(Number(id), userId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });

    const chatId = new URL(req.url).searchParams.get("chatId") ?? "";
    const chatIdError = validateChatId(chatId);
    if (chatIdError) return NextResponse.json({ error: chatIdError }, { status: 400 });

    const connectionId = new URL(req.url).searchParams.get("connectionId") || null;
    db.delete(botMessages)
      .where(
        and(
          eq(botMessages.botId, bot.id),
          eq(botMessages.chatId, chatId),
          connectionId ? eq(botMessages.businessConnectionId, connectionId) : isNull(botMessages.businessConnectionId)
        )
      )
      .run();
    // Business customers have no contact row, and a direct contact must survive clearing a business chat.
    if (!connectionId) db.delete(botUsers).where(and(eq(botUsers.botId, bot.id), eq(botUsers.chatId, chatId))).run();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
