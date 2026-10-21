import { NextResponse } from "next/server";
import { Api } from "teleproto/tl";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { getClient } from "@/lib/mtproto";
import { createBot } from "@/lib/botfather";
import {
  getBotToken,
  healthOf,
  listBots,
  pruneBotsNotIn,
  saveBotToken,
  upsertBotFromTelegram,
  withLiveBotToken,
} from "@/lib/bots";
import { botApi } from "@/lib/botapi";
import { maskSecret } from "@/lib/crypto";
import { cachedProgress } from "@/lib/setup-progress";
import { singleFlight } from "@/lib/single-flight";
import { BotHeldByAnotherAccountError } from "@/lib/token-bot";
import { validateBotName, validateBotUsername } from "@/lib/validation";

/**
 * GET: syncs the current user's local bot list against bots.getAdminedBots,
 * then returns every bot they own with its Bot API details — best-effort
 * per bot so one dead token doesn't blank the whole list.
 */
export const GET = withAuth(async (_req, _ctx, userId) => {
  try {
    const client = await getClient(userId);
    if (!client) return NextResponse.json({ error: "Not logged in." }, { status: 401 });

    const adminedBots = (await client.invoke(new Api.bots.GetAdminedBots())) as Api.User[];
    // Bots another dashboard account already manages (added there by token) can't be listed here too: say so, but don't fail the sync.
    const skipped: string[] = [];
    for (const b of adminedBots) {
      if (!b.username) continue;
      try {
        await upsertBotFromTelegram({
          ownerUserId: userId,
          telegramId: b.id.toString(),
          username: b.username,
          firstName: b.firstName ?? b.username,
        });
      } catch (err) {
        if (!(err instanceof BotHeldByAnotherAccountError)) throw err;
        skipped.push(b.username);
      }
    }
    await pruneBotsNotIn(userId, new Set(adminedBots.map((b) => b.id.toString())));

    const rows = await listBots(userId);
    const results = await Promise.all(
      rows.map(async (bot) => {
        const token = getBotToken(bot);
        const base = {
          id: bot.id,
          telegramId: bot.telegramId,
          username: bot.username,
          firstName: bot.firstName,
          source: bot.source,
          monitorEnabled: bot.monitorEnabled,
          runElsewhere: bot.runElsewhere,
          health: healthOf(bot),
          setup: cachedProgress(bot.setupProgress),
        };
        if (!token) return { ...base, hasToken: false, maskedToken: null, details: null, error: null };
        try {
          const { result, token: liveToken } = await withLiveBotToken(bot, userId, (liveToken) =>
            Promise.all([botApi.getMe(liveToken), botApi.getWebhookInfo(liveToken)])
          );
          const [info, webhook] = result;
          return {
            ...base,
            hasToken: true,
            maskedToken: maskSecret(liveToken),
            details: { ...info },
            webhook,
            error: null,
          };
        } catch (err) {
          return {
            ...base,
            hasToken: true,
            maskedToken: maskSecret(token),
            details: null,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })
    );

    return NextResponse.json({ bots: results, skipped });
  } catch (err) {
    return errorResponse(err);
  }
});

/** POST: creates a new bot through BotFather and stores its token, owned by the current user. */
export const POST = withAuth(async (req, _ctx, userId) => {
  try {
    const { name, username } = await req.json();
    if (typeof name !== "string" || typeof username !== "string") {
      return NextResponse.json({ error: "Both name and username are required." }, { status: 400 });
    }
    const nameError = validateBotName(name);
    if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });
    const usernameError = validateBotUsername(username);
    if (usernameError) return NextResponse.json({ error: usernameError }, { status: 400 });

    const { row, token } = await singleFlight(`create:${userId}:${username.trim().toLowerCase()}`, async () => {
      const created = await createBot(userId, name.trim(), username.trim());
      const me = await botApi.getMe(created.token);
      const upserted = await upsertBotFromTelegram({
        ownerUserId: userId,
        telegramId: me.id.toString(),
        username: created.username.replace(/^@/, ""),
        firstName: me.first_name,
      });
      await saveBotToken(upserted.id, created.token);
      return { row: upserted, token: created.token };
    });

    return NextResponse.json({ ok: true, id: row.id, username: row.username, token });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
