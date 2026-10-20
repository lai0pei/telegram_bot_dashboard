import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { getBotById, getBotToken } from "@/lib/bots";
import { botApi, type BotCommand, type BotCommandScopeType } from "@/lib/botapi";
import {
  validateCommand,
  validateCommandDescription,
  validateCommandScope,
  validateCommandTarget,
  validateLanguageCode,
} from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

async function resolve(ctx: Ctx, userId: string) {
  const { id } = await ctx.params;
  const bot = getBotById(Number(id), userId);
  if (!bot) return { error: NextResponse.json({ error: "Bot not found." }, { status: 404 }) };
  const token = getBotToken(bot);
  if (!token) return { error: NextResponse.json({ error: "No token stored for this bot." }, { status: 400 }) };
  return { token };
}

/** A trimmed non-empty string, or undefined (so a missing/blank/mistyped value never reaches Telegram). */
function clean(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function checkTarget(scope: unknown, lang: string, chatId: unknown, userId: unknown): NextResponse | null {
  const error = validateCommandScope(scope) ?? validateLanguageCode(lang) ?? validateCommandTarget(scope as string, chatId, userId);
  return error ? NextResponse.json({ error }, { status: 400 }) : null;
}

/** GET ?scope=&lang=: commands for one scope + language. */
export const GET = withAuth(async (req: Request, ctx: Ctx, userId: string) => {
  try {
    const r = await resolve(ctx, userId);
    if (r.error) return r.error;
    const params = new URL(req.url).searchParams;
    const scope = params.get("scope") ?? "default";
    const lang = params.get("lang") ?? "";
    const chatId = params.get("chatId") ?? undefined;
    const targetUserId = params.get("userId") ?? undefined;
    const bad = checkTarget(scope, lang, chatId, targetUserId);
    if (bad) return bad;
    const commands = await botApi.getMyCommands(r.token, { scope: scope as BotCommandScopeType, languageCode: lang, chatId: clean(chatId), userId: clean(targetUserId) });
    return NextResponse.json({ commands });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err, 400);
  }
});

/** PUT { scope, languageCode, commands }: replaces the commands for that scope + language. */
export const PUT = withAuth(async (req: Request, ctx: Ctx, userId: string) => {
  try {
    const r = await resolve(ctx, userId);
    if (r.error) return r.error;
    const body = await req.json();
    const scope = body.scope ?? "default";
    const lang = typeof body.languageCode === "string" ? body.languageCode : "";
    const bad = checkTarget(scope, lang, body.chatId, body.userId);
    if (bad) return bad;
    if (!Array.isArray(body.commands)) return NextResponse.json({ error: "Commands must be a list." }, { status: 400 });
    const commands = body.commands as BotCommand[];
    for (const c of commands) {
      const error = validateCommand(c.command) ?? validateCommandDescription(c.description);
      if (error) return NextResponse.json({ error }, { status: 400 });
    }
    await botApi.setMyCommands(r.token, commands, { scope, languageCode: lang, chatId: clean(body.chatId), userId: clean(body.userId) });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err, 400);
  }
});

/** DELETE ?scope=&lang=: removes that scope + language's commands so the fallback applies again. */
export const DELETE = withAuth(async (req: Request, ctx: Ctx, userId: string) => {
  try {
    const r = await resolve(ctx, userId);
    if (r.error) return r.error;
    const params = new URL(req.url).searchParams;
    const scope = params.get("scope") ?? "default";
    const lang = params.get("lang") ?? "";
    const chatId = params.get("chatId") ?? undefined;
    const targetUserId = params.get("userId") ?? undefined;
    const bad = checkTarget(scope, lang, chatId, targetUserId);
    if (bad) return bad;
    await botApi.deleteMyCommands(r.token, { scope: scope as BotCommandScopeType, languageCode: lang, chatId: clean(chatId), userId: clean(targetUserId) });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err, 400);
  }
});
