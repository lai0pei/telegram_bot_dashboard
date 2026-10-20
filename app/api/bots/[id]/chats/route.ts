import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { listBotChats, NotAChatError, parseRights, refreshBotChat } from "@/lib/bot-chats";
import { pendingJoinRequestCounts } from "@/lib/join-requests";
import { getBotById } from "@/lib/bots";
import { validateChatId } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

const USERNAME_REF = /^@[A-Za-z][A-Za-z0-9_]{3,31}$/;

/** GET: the groups/supergroups/channels this bot is tracked in (from updates, adds and imports), newest first. */
export const GET = withAuth(async (_req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const pending = await pendingJoinRequestCounts(bot.id);
    const chats = (await listBotChats(bot.id))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((c) => ({
        chatId: c.chatId,
        type: c.type,
        title: c.title,
        username: c.username,
        status: c.status,
        rights: parseRights(c),
        updatedAt: c.updatedAt,
        pendingRequests: pending[c.chatId] ?? 0,
      }));
    return NextResponse.json({ chats });
  } catch (err) {
    return errorResponse(err);
  }
});

/** POST { chat }: adds a chat by numeric ID or @username after checking with Telegram that the bot is a member. */
export const POST = withAuth(async (req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const body = await req.json().catch(() => null);
    const ref = typeof body?.chat === "string" ? body.chat.trim() : "";
    if (!ref || (!USERNAME_REF.test(ref) && validateChatId(ref))) {
      return NextResponse.json({ error: "Enter a numeric chat ID (like -1001234567890) or a public @username." }, { status: 400 });
    }
    const row = await refreshBotChat(bot, telegramAccountId, ref);
    if (!row) return NextResponse.json({ error: "The bot isn't a member of that chat." }, { status: 422 });
    return NextResponse.json({ chatId: row.chatId });
  } catch (err) {
    if (err instanceof NotAChatError) return NextResponse.json({ error: err.message }, { status: 400 });
    return botApiErrorResponse(err) ?? errorResponse(err);
  }
});
