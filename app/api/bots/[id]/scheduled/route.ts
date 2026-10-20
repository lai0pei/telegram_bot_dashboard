import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { eq } from "drizzle-orm";
import { listBotChats } from "@/lib/bot-chats";
import { getBotById } from "@/lib/bots";
import { db } from "@/lib/db";
import { botUsers } from "@/lib/db/schema";
import type { InlineButton } from "@/lib/botapi";
import { createScheduled, listScheduled, toScheduledDto } from "@/lib/scheduled";
import {
  normalizeInlineButtons,
  validateChatId,
  validateInlineButtons,
  validateMessageText,
  validateParseMode,
  validateSendAt,
} from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth(async (_req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    // Suggestions for the "send to" picker: people who wrote to the bot, and chats it's currently in.
    const contacts = db.select().from(botUsers).where(eq(botUsers.botId, bot.id)).all();
    const destinations = [
      ...contacts
        .filter((u) => !u.chatId.startsWith("-"))
        .map((u) => ({ chatId: u.chatId, name: u.firstName || (u.username ? `@${u.username}` : u.chatId), kind: "user" as const })),
      ...listBotChats(bot.id)
        .filter((c) => c.status === "member" || c.status === "administrator")
        .map((c) => ({ chatId: c.chatId, name: c.title, kind: c.type === "channel" ? ("channel" as const) : ("group" as const) })),
    ];
    return NextResponse.json({ scheduled: listScheduled(bot.id).map(toScheduledDto), destinations });
  } catch (err) {
    return errorResponse(err);
  }
});

/** POST { chatId, text, parseMode?, buttons?, sendAt }: `sendAt` is epoch milliseconds. */
export const POST = withAuth(async (req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    if (!bot.encryptedToken) return NextResponse.json({ error: "This bot has no stored token yet." }, { status: 400 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body.chatId !== "string" || typeof body.text !== "string") {
      return NextResponse.json({ error: "chatId and text are required." }, { status: 400 });
    }
    const error =
      validateChatId(body.chatId) ??
      validateMessageText(body.text) ??
      validateParseMode(body.parseMode) ??
      validateInlineButtons(body.buttons, body.chatId) ??
      validateSendAt(body.sendAt);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const row = createScheduled(bot.id, {
      chatId: body.chatId.trim(),
      text: body.text,
      parseMode: body.parseMode || null,
      buttons: normalizeInlineButtons(body.buttons) as InlineButton[][] | null,
      sendAt: body.sendAt,
    });
    return NextResponse.json({ scheduled: toScheduledDto(row) });
  } catch (err) {
    return errorResponse(err);
  }
});
