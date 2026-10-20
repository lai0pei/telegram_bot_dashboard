import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { downloadBotFile, type TelegramMessage } from "@/lib/botapi";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { getBotById, withLiveBotToken } from "@/lib/bots";
import { db } from "@/lib/db";
import { botMessages } from "@/lib/db/schema";
import { mediaFileId } from "@/lib/messages";

/** Types the browser may render inline. Everything else is forced to download so user-sent HTML/SVG can't run on our origin. */
const INLINE_TYPES = /^(image\/(jpeg|png|gif|webp)|video\/(mp4|webm)|audio\/(mpeg|mp4|ogg|webm|x-m4a))$/;

/** GET: the media (photo, document, video, ...) of a stored message, downloaded from Telegram with the bot's token (max 20 MB). */
export const GET = withAuth(
  async (req: Request, ctx: { params: Promise<{ id: string; messageId: string }> }, userId: string) => {
    try {
      const { id, messageId } = await ctx.params;
      const bot = await getBotById(Number(id), userId);
      if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
      const row = (await db
        .select()
        .from(botMessages)
        .where(and(eq(botMessages.id, Number(messageId)), eq(botMessages.botId, bot.id))))[0];
      if (!row?.raw) return NextResponse.json({ error: "Message not found." }, { status: 404 });

      let media: ReturnType<typeof mediaFileId> = null;
      try {
        media = mediaFileId(JSON.parse(row.raw) as TelegramMessage);
      } catch {
        // raw isn't a message object (e.g. a callback-query row): no media
      }
      if (!media) return NextResponse.json({ error: "This message has no downloadable media." }, { status: 404 });
      const { fileId, mimeType, fileName } = media;

      const file = await withLiveBotToken(bot, userId, (token) => downloadBotFile(token, fileId));
      const contentType = mimeType ?? file.result.contentType ?? "application/octet-stream";
      const etag = `"${createHash("sha1").update(file.result.data).digest("base64url")}"`;
      const headers: Record<string, string> = {
        ETag: etag,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      };
      if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });

      const inline = INLINE_TYPES.test(contentType);
      const safeName = (fileName ?? `message-${row.id}`).replace(/[^\w.\- ]/g, "_");
      headers["Content-Type"] = inline ? contentType : "application/octet-stream";
      headers["Content-Disposition"] = `${inline ? "inline" : "attachment"}; filename="${safeName}"`;
      return new Response(new Uint8Array(file.result.data), { headers });
    } catch (err) {
      return botApiErrorResponse(err) ?? errorResponse(err);
    }
  }
);
