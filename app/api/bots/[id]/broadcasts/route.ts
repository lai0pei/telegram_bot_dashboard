import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { parseButtons } from "@/lib/auto-replies";
import { BroadcastConflictError, countRecipients, createBroadcast, listBroadcasts, parseTargets, type BroadcastRow } from "@/lib/broadcast";
import { getBotById } from "@/lib/bots";
import type { InlineButton } from "@/lib/botapi";
import {
  MAX_BROADCAST_TARGETS,
  chatIdForButtons,
  normalizeChatIds,
  normalizeInlineButtons,
  validateChatIds,
  validateInlineButtons,
  validateMessageText,
  validateParseMode,
} from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

/** The row as the client sees it: buttons and targets parsed rather than JSON text. */
const toDto = (b: BroadcastRow) => ({ ...b, buttons: parseButtons(b.buttons), targets: parseTargets(b.targets) });

/** GET: how many people a broadcast would reach, plus recent broadcasts with their progress. */
export const GET = withAuth(async (_req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const broadcasts = (await listBroadcasts(bot.id)).map(toDto);
    return NextResponse.json({ recipients: (await countRecipients(bot.id)), broadcasts });
  } catch (err) {
    return errorResponse(err);
  }
});

/**
 * POST { text, parseMode?, buttons?, targets? }: queue a message. Without `targets` it goes to every contact who hasn't
 * blocked the bot; with `targets` (chat IDs of contacts, groups or channels this bot knows) only to those. An empty
 * `targets` list is an error, never "everyone".
 */
export const POST = withAuth(async (req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    if (!bot.encryptedToken) return NextResponse.json({ error: "This bot has no stored token yet." }, { status: 400 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body.text !== "string") return NextResponse.json({ error: "Message text is required." }, { status: 400 });
    const chosen = body.targets !== undefined && body.targets !== null;
    const targetsError = chosen ? validateChatIds(body.targets, MAX_BROADCAST_TARGETS) : null;
    if (targetsError) return NextResponse.json({ error: targetsError }, { status: 400 });
    const targets = chosen ? normalizeChatIds(body.targets as string[]) : null;
    const error =
      validateMessageText(body.text) ?? validateParseMode(body.parseMode) ?? validateInlineButtons(body.buttons, targets ? chatIdForButtons(targets) : "1");
    if (error) return NextResponse.json({ error }, { status: 400 });

    const broadcast = await createBroadcast(bot.id, {
      text: body.text,
      parseMode: body.parseMode || null,
      buttons: normalizeInlineButtons(body.buttons) as InlineButton[][] | null,
      targets,
    });
    return NextResponse.json({ broadcast: toDto(broadcast) });
  } catch (err) {
    // 422, not 409: 409 is reserved for NO_ACTIVE_ACCOUNT / SESSION_REVOKED.
    if (err instanceof BroadcastConflictError) return NextResponse.json({ error: err.message }, { status: 422 });
    return errorResponse(err);
  }
});
