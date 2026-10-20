import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { BotFatherError } from "@/lib/botfather";
import { deleteMiniApp } from "@/lib/botfather-apps";
import { getBotById } from "@/lib/bots";
import { getMiniApp, removeMiniApp } from "@/lib/mini-apps";
import { singleFlight } from "@/lib/single-flight";

type Ctx = { params: Promise<{ id: string; appId: string }> };

/** DELETE: deletes the Mini App through @BotFather (/myapps), then forgets it here. */
export const DELETE = withAuth(async (_req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const { id, appId } = await ctx.params;
    const bot = getBotById(Number(id), telegramAccountId);
    const app = bot && getMiniApp(bot.id, Number(appId));
    if (!bot || !app) return NextResponse.json({ error: "Mini App not found." }, { status: 404 });
    await singleFlight(`deleteapp:${telegramAccountId}:${app.id}`, async () => {
      await deleteMiniApp(telegramAccountId, bot.username, app);
      removeMiniApp(bot.id, app.id);
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return err instanceof BotFatherError ? NextResponse.json({ error: err.message }, { status: 502 }) : errorResponse(err);
  }
});
