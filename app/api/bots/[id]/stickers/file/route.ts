import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { downloadBotFile } from "@/lib/botapi";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { getBotById, withLiveBotToken } from "@/lib/bots";

/** Only still images render inline: a .tgs or .webm can't be shown by <img> anyway (the UI asks for the thumbnail). */
const INLINE_TYPES = /^image\/(jpeg|png|webp)$/;

/** GET ?fileId=: a sticker's file (or thumbnail), downloaded from Telegram with the bot's token. */
export const GET = withAuth(async (req: Request, ctx: { params: Promise<{ id: string }> }, telegramAccountId: string) => {
  try {
    const bot = getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const fileId = new URL(req.url).searchParams.get("fileId") ?? "";
    if (!/^[\w-]{10,255}$/.test(fileId)) return NextResponse.json({ error: "Invalid file." }, { status: 400 });

    const { result } = await withLiveBotToken(bot, telegramAccountId, (token) => downloadBotFile(token, fileId));
    const etag = `"${createHash("sha1").update(result.data).digest("base64url")}"`;
    const headers: Record<string, string> = {
      ETag: etag,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    };
    if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    const inline = INLINE_TYPES.test(result.contentType ?? "");
    headers["Content-Type"] = inline ? (result.contentType as string) : "application/octet-stream";
    headers["Content-Disposition"] = inline ? "inline" : 'attachment; filename="sticker"';
    return new Response(new Uint8Array(result.data), { headers });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err);
  }
});
