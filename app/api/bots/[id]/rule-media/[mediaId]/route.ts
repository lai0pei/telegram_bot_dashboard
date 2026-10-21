import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { getBotById } from "@/lib/bots";
import { getRuleMedia } from "@/lib/rule-media";

/** Types the browser may render inline. Everything else is forced to download, same rule as the messages media route. */
const INLINE_TYPES = /^(image\/(jpeg|png|gif|webp)|video\/(mp4|webm)|audio\/(mpeg|mp4|ogg|webm|x-m4a))$/;

/** GET: the stored bytes of a file attached to one of this bot's rules (for the preview in the rule editor). */
export const GET = withAuth(async (_req: Request, ctx: { params: Promise<{ id: string; mediaId: string }> }, telegramAccountId: string) => {
  try {
    const { id, mediaId } = await ctx.params;
    const bot = await getBotById(Number(id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const row = await getRuleMedia(bot.id, Number(mediaId));
    if (!row) return NextResponse.json({ error: "File not found." }, { status: 404 });
    const inline = INLINE_TYPES.test(row.mime);
    const safeName = row.name.replace(/[^\w.\- ]/g, "_");
    return new Response(new Uint8Array(row.data), {
      headers: {
        "Content-Type": inline ? row.mime : "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
});
