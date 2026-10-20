import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { botApi } from "@/lib/botapi";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { loadBotChat, type BotChatParams } from "@/lib/bot-chat-route";
import { parseRights } from "@/lib/bot-chats";
import { withLiveBotToken } from "@/lib/bots";
import { invalidatePhoto, photoKey } from "@/lib/photos";
import { validateProfilePhoto } from "@/lib/validation";

// Reading the photo reuses GET /api/bots/[id]/contacts/[chatId]/photo (same getChat -> file download, same cache).

const noRight = () =>
  NextResponse.json({ error: "The bot doesn't have the \"change info\" right in this chat." }, { status: 403 });

/** PUT multipart/form-data { file }: sets the chat's photo as the bot. */
export const PUT = withAuth(async (req: Request, ctx: BotChatParams, telegramAccountId: string) => {
  try {
    const loaded = await loadBotChat(ctx, telegramAccountId);
    if (loaded instanceof Response) return loaded;
    const { bot, chat } = loaded;
    if (!parseRights(chat)?.canChangeInfo) return noRight();

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "A photo file is required." }, { status: 400 });
    const fileError = validateProfilePhoto(file);
    if (fileError) return NextResponse.json({ error: fileError }, { status: 400 });

    const data = Buffer.from(await file.arrayBuffer());
    await withLiveBotToken(bot, telegramAccountId, (token) =>
      botApi.setChatPhoto(token, chat.chatId, { name: file.name || "photo.jpg", type: file.type, data })
    );
    invalidatePhoto(photoKey(telegramAccountId, "bot-chat", `${bot.id}:${chat.chatId}`));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err);
  }
});

/** DELETE: removes the chat's photo as the bot. */
export const DELETE = withAuth(async (_req: Request, ctx: BotChatParams, telegramAccountId: string) => {
  try {
    const loaded = await loadBotChat(ctx, telegramAccountId);
    if (loaded instanceof Response) return loaded;
    const { bot, chat } = loaded;
    if (!parseRights(chat)?.canChangeInfo) return noRight();

    await withLiveBotToken(bot, telegramAccountId, (token) => botApi.deleteChatPhoto(token, chat.chatId));
    invalidatePhoto(photoKey(telegramAccountId, "bot-chat", `${bot.id}:${chat.chatId}`));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err);
  }
});
