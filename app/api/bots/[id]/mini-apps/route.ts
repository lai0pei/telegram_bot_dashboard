import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { BotFatherError } from "@/lib/botfather";
import { createMiniApp, validateAppPhoto } from "@/lib/botfather-apps";
import { getBotById } from "@/lib/bots";
import { listMiniApps, saveMiniApp } from "@/lib/mini-apps";
import { singleFlight } from "@/lib/single-flight";
import { validateAppShortName, validateAppTexts, validateHttpsUrlOrNull } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth(async (_req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    return NextResponse.json({ apps: (await listMiniApps(bot.id)), botUsername: bot.username });
  } catch (err) {
    return errorResponse(err);
  }
});

/** POST multipart { title, description, shortName, url, photo (640×360 PNG/JPEG) }: creates a Mini App through @BotFather (/newapp). */
export const POST = withAuth(async (req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const form = await req.formData().catch(() => null);
    const title = form?.get("title");
    const description = form?.get("description");
    const shortName = form?.get("shortName");
    const url = form?.get("url");
    const photo = form?.get("photo");
    const error = validateAppTexts(title, description) ?? validateAppShortName(shortName) ?? validateHttpsUrlOrNull(url, "Mini App URL");
    if (error) return NextResponse.json({ error }, { status: 400 });
    if (!(photo instanceof File)) return NextResponse.json({ error: "A 640×360 picture is required." }, { status: 400 });
    const data = Buffer.from(await photo.arrayBuffer());
    const photoError = validateAppPhoto(data);
    if (photoError) return NextResponse.json({ error: photoError }, { status: 400 });

    const app = { title: title as string, description: description as string, shortName: shortName as string, url: (url as string).trim() };
    await singleFlight(`newapp:${telegramAccountId}:${bot.id}:${app.shortName}`, () =>
      createMiniApp(telegramAccountId, bot.username, { ...app, photo: { name: photo.name || "app.png", data } })
    );
    return NextResponse.json({ app: (await saveMiniApp(bot.id, app)) });
  } catch (err) {
    return err instanceof BotFatherError ? NextResponse.json({ error: err.message }, { status: 502 }) : errorResponse(err);
  }
});
