import type { TelegramMessage } from "./botapi";
import { db } from "./db";
import { botMessages } from "./db/schema";
import { describeMessage } from "./messages";

/** Stores a message the bot just sent (from the dashboard, an auto-reply or a scheduled send) as an "out" row. */
export async function recordOutgoing(botId: number, sent: TelegramMessage, replyToMessageId?: number | null, businessConnectionId?: string | null) {
  const described = describeMessage(sent);
  return (await db
    .insert(botMessages)
    .values({
      botId,
      chatId: String(sent.chat.id),
      fromUserId: null,
      fromUsername: null,
      fromFirstName: null,
      direction: "out",
      text: described.text,
      mediaType: described.mediaType,
      replyToMessageId: replyToMessageId ?? null,
      businessConnectionId: businessConnectionId ?? null,
      raw: JSON.stringify(sent),
      telegramMessageId: sent.message_id,
      createdAt: new Date(),
    })
    .returning())[0];
}
