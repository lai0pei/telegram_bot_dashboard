import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { botApi } from "@/lib/botapi";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { upsertBotUser } from "@/lib/bot-users";
import { getBotById, withLiveBotToken } from "@/lib/bots";
import { toMessageRow } from "@/lib/messages";
import { recordOutgoing } from "@/lib/outgoing";
import { validateChatId, validatePoll } from "@/lib/validation";

/**
 * POST { chatId, question, options: string[], isAnonymous?, allowsMultiple?, quiz?: { correctIndex, explanation? } }
 * Sends a poll (or quiz). Telegram applies its own rules per chat type (e.g. channel polls must be anonymous).
 */
export const POST = withAuth(async (req: Request, ctx: { params: Promise<{ id: string }> }, telegramAccountId: string) => {
  try {
    const bot = getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body.chatId !== "string") return NextResponse.json({ error: "chatId is required." }, { status: 400 });
    const error = validateChatId(body.chatId) ?? validatePoll(body);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const quiz = body.quiz ? { correctIndex: body.quiz.correctIndex as number, explanation: body.quiz.explanation as string | undefined } : undefined;
    const { result: sent } = await withLiveBotToken(bot, telegramAccountId, (token) =>
      botApi.sendPoll(token, body.chatId.trim(), {
        question: body.question.trim(),
        options: (body.options as string[]).map((o) => o.trim()),
        isAnonymous: body.isAnonymous !== false,
        allowsMultiple: body.allowsMultiple === true,
        quiz,
      })
    );

    if (sent.chat.type === "private") {
      upsertBotUser(bot.id, String(sent.chat.id), { username: sent.chat.username ?? null, firstName: sent.chat.first_name ?? null, touch: false });
    }
    return NextResponse.json({ message: toMessageRow(recordOutgoing(bot.id, sent)) });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err);
  }
});
