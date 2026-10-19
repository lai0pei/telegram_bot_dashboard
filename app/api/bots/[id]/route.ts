import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { deleteBot as botFatherDelete } from "@/lib/botfather";
import { deleteBotRow, getBotById, getBotToken } from "@/lib/bots";
import { botApi, type BotCommand } from "@/lib/botapi";
import { singleFlight } from "@/lib/single-flight";

export const GET = withAuth(async (_req: Request, ctx: { params: Promise<{ id: string }> }, userId: string) => {
  try {
    const { id } = await ctx.params;
    const bot = getBotById(Number(id), userId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });

    const token = getBotToken(bot);
    if (!token) {
      return NextResponse.json({
        id: bot.id,
        username: bot.username,
        firstName: bot.firstName,
        hasToken: false,
        monitorEnabled: bot.monitorEnabled,
      });
    }

    const [info, name, description, shortDescription, commands, webhook] = await Promise.all([
      botApi.getMe(token),
      botApi.getMyName(token).catch(() => ({ name: "" })),
      botApi.getMyDescription(token).catch(() => ({ description: "" })),
      botApi.getMyShortDescription(token).catch(() => ({ short_description: "" })),
      botApi.getMyCommands(token).catch(() => [] as BotCommand[]),
      botApi.getWebhookInfo(token).catch(() => null),
    ]);

    return NextResponse.json({
      id: bot.id,
      username: bot.username,
      firstName: bot.firstName,
      hasToken: true,
      token,
      monitorEnabled: bot.monitorEnabled,
      info,
      name: name.name,
      description: description.description,
      shortDescription: shortDescription.short_description,
      commands,
      webhook,
    });
  } catch (err) {
    return errorResponse(err);
  }
});

/** PATCH: update one or more bot settings via the Bot API. Body is a sparse set of fields. */
export const PATCH = withAuth(
  async (req: Request, ctx: { params: Promise<{ id: string }> }, userId: string) => {
    try {
      const { id } = await ctx.params;
      const bot = getBotById(Number(id), userId);
      if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
      const token = getBotToken(bot);
      if (!token) return NextResponse.json({ error: "No token stored for this bot." }, { status: 400 });

      const body = await req.json();
      const applied: string[] = [];

      if (typeof body.name === "string") {
        await botApi.setMyName(token, body.name);
        applied.push("name");
      }
      if (typeof body.description === "string") {
        await botApi.setMyDescription(token, body.description);
        applied.push("description");
      }
      if (typeof body.shortDescription === "string") {
        await botApi.setMyShortDescription(token, body.shortDescription);
        applied.push("shortDescription");
      }
      if (Array.isArray(body.commands)) {
        await botApi.setMyCommands(token, body.commands as BotCommand[]);
        applied.push("commands");
      }

      return NextResponse.json({ ok: true, applied });
    } catch (err) {
      return errorResponse(err, 400);
    }
  }
);

/** DELETE: deletes the bot through BotFather and removes local records. */
export const DELETE = withAuth(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }, userId: string) => {
    try {
      const { id } = await ctx.params;
      const bot = getBotById(Number(id), userId);
      if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });

      await singleFlight(`delete:${userId}:${bot.id}`, async () => {
        await botFatherDelete(userId, bot.username);
        deleteBotRow(bot.id);
      });

      return NextResponse.json({ ok: true });
    } catch (err) {
      return errorResponse(err, 400);
    }
  }
);
