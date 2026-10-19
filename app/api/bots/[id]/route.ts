import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { deleteBot as botFatherDelete } from "@/lib/botfather";
import { deleteBotRow, getBotById, getBotToken, setWebhookHealth, withLiveBotToken } from "@/lib/bots";
import { botApi, type BotCommand } from "@/lib/botapi";
import { singleFlight } from "@/lib/single-flight";
import {
  validateBotName,
  validateCommand,
  validateCommandDescription,
  validateDescription,
  validateShortDescription,
} from "@/lib/validation";

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

    const { result, token: liveToken } = await withLiveBotToken(bot, userId, async (liveToken) => {
      const [info, name, description, shortDescription, commands, webhook] = await Promise.all([
        botApi.getMe(liveToken),
        botApi.getMyName(liveToken).catch(() => ({ name: "" })),
        botApi.getMyDescription(liveToken).catch(() => ({ description: "" })),
        botApi.getMyShortDescription(liveToken).catch(() => ({ short_description: "" })),
        botApi.getMyCommands(liveToken).catch(() => [] as BotCommand[]),
        botApi.getWebhookInfo(liveToken).catch(() => null),
      ]);
      return { info, name, description, shortDescription, commands, webhook };
    });

    setWebhookHealth(
      bot.id,
      result.webhook?.last_error_message ?? null,
      result.webhook?.pending_update_count ?? null
    );

    return NextResponse.json({
      id: bot.id,
      username: bot.username,
      firstName: bot.firstName,
      hasToken: true,
      token: liveToken,
      monitorEnabled: bot.monitorEnabled,
      info: result.info,
      name: result.name.name,
      description: result.description.description,
      shortDescription: result.shortDescription.short_description,
      commands: result.commands,
      webhook: result.webhook,
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
        const error = validateBotName(body.name);
        if (error) return NextResponse.json({ error }, { status: 400 });
        await botApi.setMyName(token, body.name.trim());
        applied.push("name");
      }
      if (typeof body.description === "string") {
        const error = validateDescription(body.description);
        if (error) return NextResponse.json({ error }, { status: 400 });
        await botApi.setMyDescription(token, body.description);
        applied.push("description");
      }
      if (typeof body.shortDescription === "string") {
        const error = validateShortDescription(body.shortDescription);
        if (error) return NextResponse.json({ error }, { status: 400 });
        await botApi.setMyShortDescription(token, body.shortDescription);
        applied.push("shortDescription");
      }
      if (Array.isArray(body.commands)) {
        const commands = body.commands as BotCommand[];
        for (const c of commands) {
          const commandError = validateCommand(c.command);
          if (commandError) return NextResponse.json({ error: commandError }, { status: 400 });
          const descriptionError = validateCommandDescription(c.description);
          if (descriptionError) return NextResponse.json({ error: descriptionError }, { status: 400 });
        }
        await botApi.setMyCommands(token, commands);
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
