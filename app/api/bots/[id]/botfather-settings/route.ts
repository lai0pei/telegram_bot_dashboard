import { NextResponse } from "next/server";
import { ownedBotOnly } from "@/lib/token-bot";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { botApi } from "@/lib/botapi";
import { BotFatherError, runSetting } from "@/lib/botfather";
import { matchesRequested, parseSettingRequest, SETTING_SPECS } from "@/lib/botfather-settings";
import { getBotById, withLiveBotToken } from "@/lib/bots";
import { singleFlight } from "@/lib/single-flight";

type Ctx = { params: Promise<{ id: string }> };

/** getMe can lag a moment behind BotFather, so a mismatch is re-read once before it counts as a failure. */
const RECHECK_DELAY_MS = 1500;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * PATCH { setting, value }: changes a setting only @BotFather can change by scripting its chat, then (where
 * Telegram reports it) re-reads getMe to confirm. The BotFather conversation finishes and releases its lock BEFORE
 * getMe is read, because withLiveBotToken may itself need BotFather to heal a dead token.
 * Returns { verified: true, info } when confirmed, { verified: false, botFatherReply } when it can't be read back.
 */
export const PATCH = withAuth(async (req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const owned = ownedBotOnly(bot);
    if (owned) return owned;

    const parsed = parseSettingRequest(await req.json().catch(() => null));
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const spec = SETTING_SPECS[parsed.key];
    const normalized = parsed.value;

    const run = await singleFlight(`botfather-setting:${bot.id}:${spec.key}`, () => runSetting(telegramAccountId, bot.username, spec, normalized));

    if (!spec.verifiable) return NextResponse.json({ verified: false, botFatherReply: run.reply });

    let info = (await withLiveBotToken(bot, telegramAccountId, (token) => botApi.getMe(token))).result;
    if (matchesRequested(spec.key, normalized, info) === false) {
      await sleep(RECHECK_DELAY_MS);
      info = (await withLiveBotToken(bot, telegramAccountId, (token) => botApi.getMe(token))).result;
    }
    if (matchesRequested(spec.key, normalized, info) === false) {
      return NextResponse.json(
        { error: `BotFather replied, but Telegram still shows the old setting. BotFather said: "${run.reply}"`, botFatherReply: run.reply },
        { status: 502 }
      );
    }
    return NextResponse.json({ verified: true, info, botFatherReply: run.reply });
  } catch (err) {
    // BotFather's wording didn't match what was expected: say what it actually said (502, never 401/409).
    if (err instanceof BotFatherError) return NextResponse.json({ error: err.message }, { status: 502 });
    return errorResponse(err);
  }
});
