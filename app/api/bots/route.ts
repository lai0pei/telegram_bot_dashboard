import { NextResponse } from "next/server";
import { Api } from "teleproto/tl";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { getClient } from "@/lib/mtproto";
import { createBot } from "@/lib/botfather";
import { getBotToken, listBots, saveBotToken, upsertBotFromTelegram } from "@/lib/bots";
import { botApi } from "@/lib/botapi";
import { maskSecret } from "@/lib/crypto";

/**
 * GET: syncs the local bot list against bots.getAdminedBots, then returns
 * every known bot with its Bot API details (name/description/webhook) —
 * best-effort per bot so one dead token doesn't blank the whole list.
 */
export const GET = withAuth(async () => {
  try {
    const client = await getClient();
    if (!client) return NextResponse.json({ error: "Not logged in." }, { status: 401 });

    const adminedBots = (await client.invoke(new Api.bots.GetAdminedBots())) as Api.User[];
    for (const b of adminedBots) {
      if (!b.username) continue;
      upsertBotFromTelegram({
        telegramId: b.id.toString(),
        username: b.username,
        firstName: b.firstName ?? b.username,
      });
    }

    const rows = listBots();
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

/** POST: creates a new bot through BotFather and stores its token. */
export const POST = withAuth(async (req: Request) => {
  try {
    const { name, username } = await req.json();
    if (typeof name !== "string" || !name.trim() || typeof username !== "string" || !username.trim()) {
      return NextResponse.json({ error: "Both name and username are required." }, { status: 400 });
    }

    const { username: finalUsername, token } = await createBot(name.trim(), username.trim());

    const me = await botApi.getMe(token);
    const row = upsertBotFromTelegram({
      telegramId: me.id.toString(),
      username: finalUsername.replace(/^@/, ""),
      firstName: me.first_name,
    });
    saveBotToken(row.id, token);

    return NextResponse.json({ ok: true, id: row.id, username: row.username, token });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
