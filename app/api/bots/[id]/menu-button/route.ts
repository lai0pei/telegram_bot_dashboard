import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { getBotById, getBotToken } from "@/lib/bots";
import { botApi, type MenuButton } from "@/lib/botapi";
import { validateMenuButton, validatePrivateChatId } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

async function resolve(ctx: Ctx, userId: string) {
  const { id } = await ctx.params;
  const bot = getBotById(Number(id), userId);
  if (!bot) return { error: NextResponse.json({ error: "Bot not found." }, { status: 404 }) };
  const token = getBotToken(bot);
  if (!token) return { error: NextResponse.json({ error: "No token stored for this bot." }, { status: 400 }) };
  return { token };
}

/** GET [?chatId=]: the bot-wide default menu button, or the one a single private chat sees. */
export const GET = withAuth(async (req: Request, ctx: Ctx, userId: string) => {
  try {
    const r = await resolve(ctx, userId);
    if (r.error) return r.error;
    const chatId = new URL(req.url).searchParams.get("chatId");
    if (chatId) {
      const bad = validatePrivateChatId(chatId);
      if (bad) return NextResponse.json({ error: bad }, { status: 400 });
    }
    return NextResponse.json({ menuButton: await botApi.getChatMenuButton(r.token, chatId ? Number(chatId.trim()) : undefined) });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err, 400);
  }
});

/** PUT { menuButton, chatId? }: sets the bot-wide default menu button, or just one private chat's (`default` there clears it). */
export const PUT = withAuth(async (req: Request, ctx: Ctx, userId: string) => {
  try {
    const r = await resolve(ctx, userId);
    if (r.error) return r.error;
    const { menuButton, chatId } = await req.json();
    const error = validateMenuButton(menuButton) ?? (chatId !== undefined && chatId !== null && chatId !== "" ? validatePrivateChatId(chatId) : null);
    if (error) return NextResponse.json({ error }, { status: 400 });
    // Rebuild from known fields so nothing unexpected is forwarded to Telegram.
    const clean: MenuButton =
      menuButton.type === "web_app"
        ? { type: "web_app", text: menuButton.text, web_app: { url: menuButton.web_app.url } }
        : { type: menuButton.type };
    await botApi.setChatMenuButton(r.token, clean, chatId ? Number(chatId.trim()) : undefined);
    return NextResponse.json({ ok: true, menuButton: clean });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err, 400);
  }
});
