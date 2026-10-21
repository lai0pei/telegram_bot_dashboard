import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { getBotById } from "@/lib/bots";
import { listDestinations } from "@/lib/destinations";
import type { InlineButton } from "@/lib/botapi";
import { createScheduledMany, listScheduled, toScheduledDto } from "@/lib/scheduled";
import {
  MAX_SCHEDULED_TARGETS,
  chatIdForButtons,
  normalizeChatIds,
  normalizeInlineButtons,
  validateChatIds,
  validateInlineButtons,
  validateMessageText,
  validateParseMode,
  validateSendAt,
} from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth(async (_req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    // Names for the list of scheduled messages (the "send to" picker loads the same list from /audience).
    return NextResponse.json({ scheduled: (await listScheduled(bot.id)).map(toScheduledDto), destinations: await listDestinations(bot.id) });
  } catch (err) {
    return errorResponse(err);
  }
});

/** POST { chatIds (or one chatId), text, parseMode?, buttons?, sendAt }: one scheduled message per chat; `sendAt` is epoch milliseconds. */
export const POST = withAuth(async (req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    if (!bot.encryptedToken) return NextResponse.json({ error: "This bot has no stored token yet." }, { status: 400 });

    const body = await req.json().catch(() => null);
    const rawIds: unknown = body && (body.chatIds ?? (typeof body.chatId === "string" ? [body.chatId] : undefined));
    if (!body || typeof body.text !== "string") return NextResponse.json({ error: "chatIds and text are required." }, { status: 400 });
    const idsError = validateChatIds(rawIds, MAX_SCHEDULED_TARGETS);
    if (idsError) return NextResponse.json({ error: idsError }, { status: 400 });
    const chatIds = normalizeChatIds(rawIds as string[]);
    const error =
      validateMessageText(body.text) ??
      validateParseMode(body.parseMode) ??
      validateInlineButtons(body.buttons, chatIdForButtons(chatIds)) ??
      validateSendAt(body.sendAt);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const rows = await createScheduledMany(bot.id, chatIds, {
      text: body.text,
      parseMode: body.parseMode || null,
      buttons: normalizeInlineButtons(body.buttons) as InlineButton[][] | null,
      sendAt: body.sendAt,
    });
    return NextResponse.json({ scheduled: toScheduledDto(rows[0]), count: rows.length });
  } catch (err) {
    return errorResponse(err);
  }
});
