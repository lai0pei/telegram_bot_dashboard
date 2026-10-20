import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { getBotById, getBotToken } from "@/lib/bots";
import { botApi } from "@/lib/botapi";
import { validateLanguageCode } from "@/lib/validation";

/** GET ?lang=xx: the bot's name and descriptions for one language (empty strings = falls back to the default). */
export const GET = withAuth(async (req: Request, ctx: { params: Promise<{ id: string }> }, userId: string) => {
  try {
    const { id } = await ctx.params;
    const bot = getBotById(Number(id), userId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const token = getBotToken(bot);
    if (!token) return NextResponse.json({ error: "No token stored for this bot." }, { status: 400 });

    const lang = new URL(req.url).searchParams.get("lang") ?? "";
    const error = validateLanguageCode(lang);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const [name, description, shortDescription] = await Promise.all([
      botApi.getMyName(token, lang),
      botApi.getMyDescription(token, lang),
      botApi.getMyShortDescription(token, lang),
    ]);
    return NextResponse.json({
      name: name.name,
      description: description.description,
      shortDescription: shortDescription.short_description,
    });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err, 400);
  }
});
