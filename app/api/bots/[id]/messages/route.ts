import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { getBotById, getBotToken } from "@/lib/bots";
import { db } from "@/lib/db";
import { botMessages, botUsers } from "@/lib/db/schema";
import { botApi } from "@/lib/botapi";
import { validateChatId, validateMessageText } from "@/lib/validation";

/** GET: recent message feed + unique user count for this bot. */
export const GET = withAuth(async (req: Request, ctx: { params: Promise<{ id: string }> }, userId: string) => {
  try {
    const { id } = await ctx.params;
    const botId = Number(id);
    const bot = getBotById(botId, userId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });

    const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") ?? 100), 500);

    const messages = db
      .select()
      .from(botMessages)
      .where(eq(botMessages.botId, botId))
      .orderBy(desc(botMessages.createdAt))
      .limit(limit)
      .all();

    const users = db.select().from(botUsers).where(eq(botUsers.botId, botId)).all();

    return NextResponse.json({ messages, uniqueUserCount: users.length });
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
    const token = getBotToken(bot);
    if (!token) return NextResponse.json({ error: "No token stored for this bot." }, { status: 400 });

    const { chatId, text } = await req.json();
    if (typeof chatId !== "string" || typeof text !== "string") {
      return NextResponse.json({ error: "chatId and text are required." }, { status: 400 });
    }
    const chatIdError = validateChatId(chatId);
    if (chatIdError) return NextResponse.json({ error: chatIdError }, { status: 400 });
    const textError = validateMessageText(text);
    if (textError) return NextResponse.json({ error: textError }, { status: 400 });

    const sent = await botApi.sendMessage(token, chatId, text);

    db.insert(botMessages)
      .values({
        botId: bot.id,
        chatId: String(chatId),
        fromUserId: null,
        fromUsername: null,
        fromFirstName: null,
        direction: "out",
        text,
        raw: JSON.stringify(sent),
        telegramMessageId: sent.message_id,
        createdAt: new Date(),
      })
      .run();

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
