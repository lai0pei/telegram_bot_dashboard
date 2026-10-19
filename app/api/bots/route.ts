import { NextResponse } from "next/server";
import { Api } from "teleproto/tl";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { getClient } from "@/lib/mtproto";
import { createBot } from "@/lib/botfather";
import { getBotToken, listBots, saveBotToken, upsertBotFromTelegram } from "@/lib/bots";
import { botApi } from "@/lib/botapi";
import { maskSecret } from "@/lib/crypto";
import { singleFlight } from "@/lib/single-flight";

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
    for (const b of adminedBots) {
      if (!b.username) continue;
      upsertBotFromTelegram({
        ownerUserId: userId,
        telegramId: b.id.toString(),
        username: b.username,
        firstName: b.firstName ?? b.username,
      });
    }

    const rows = listBots(userId);
    const results = await Promise.all(
      rows.map(async (bot) => {
        const token = getBotToken(bot);
        const base = {
          id: bot.id,
          telegramId: bot.telegramId,
          username: bot.username,
          firstName: bot.firstName,
          hasToken: Boolean(token),
          maskedToken: token ? maskSecret(token) : null,
          monitorEnabled: bot.monitorEnabled,
        };
        if (!token) return { ...base, details: null, error: null };
        try {
          const [info, webhook] = await Promise.all([botApi.getMe(token), botApi.getWebhookInfo(token)]);
          return { ...base, details: { ...info }, webhook, error: null };
        } catch (err) {
          return { ...base, details: null, error: err instanceof Error ? err.message : String(err) };
        }
      })
    );

    return NextResponse.json({ bots: results });
  } catch (err) {
    return errorResponse(err);
  }
});

/** POST: creates a new bot through BotFather and stores its token, owned by the current user. */
export const POST = withAuth(async (req, _ctx, userId) => {
  try {
    const { name, username } = await req.json();
    if (typeof name !== "string" || !name.trim() || typeof username !== "string" || !username.trim()) {
      return NextResponse.json({ error: "Both name and username are required." }, { status: 400 });
    }

    const { row, token } = await singleFlight(`create:${userId}:${username.trim().toLowerCase()}`, async () => {
      const created = await createBot(userId, name.trim(), username.trim());
      const me = await botApi.getMe(created.token);
      const upserted = upsertBotFromTelegram({
        ownerUserId: userId,
        telegramId: me.id.toString(),
        username: created.username.replace(/^@/, ""),
        firstName: me.first_name,
      });
      saveBotToken(upserted.id, created.token);
      return { row: upserted, token: created.token };
    });

    return NextResponse.json({ ok: true, id: row.id, username: row.username, token });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
