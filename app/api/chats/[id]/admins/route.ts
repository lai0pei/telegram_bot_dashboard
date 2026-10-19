import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { addBotAsAdmin, getChatById } from "@/lib/chats";
import { getBotById } from "@/lib/bots";

/** POST {botId}: adds one of the current user's bots to the chat as an admin. */
export const POST = withAuth(
  async (req: Request, ctx: { params: Promise<{ id: string }> }, userId: string) => {
    try {
      const { id } = await ctx.params;
      const chat = getChatById(Number(id), userId);
      if (!chat) return NextResponse.json({ error: "Chat not found." }, { status: 404 });

      const { botId } = await req.json();
      const bot = getBotById(Number(botId), userId);
      if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });

      await addBotAsAdmin(userId, chat, bot.username);
      return NextResponse.json({ ok: true });
    } catch (err) {
      return errorResponse(err, 400);
    }
  }
);
