import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { ChatError, deleteChatPhoto, getChatById, getChatPhoto, setChatPhoto } from "@/lib/chats";
import { getCachedPhoto, invalidatePhoto, photoKey, photoResponse } from "@/lib/photos";
import { validateProfilePhoto } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

/** GET: the chat's small photo (JPEG), or 404 if it has none. Cached server-side and privately in the browser. */
export const GET = withAuth(async (req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const chat = getChatById(Number((await ctx.params).id), telegramAccountId);
    if (!chat) return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    const photo = await getCachedPhoto(photoKey(telegramAccountId, "chat", chat.id), () =>
      getChatPhoto(telegramAccountId, chat)
    );
    return photoResponse(req, photo);
  } catch (err) {
    return errorResponse(err);
  }
});

/** PUT multipart/form-data { file }: sets the chat's photo (needs the "Change info" admin right). */
export const PUT = withAuth(async (req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const chat = getChatById(Number((await ctx.params).id), telegramAccountId);
    if (!chat) return NextResponse.json({ error: "Chat not found." }, { status: 404 });

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "A photo file is required." }, { status: 400 });
    const fileError = validateProfilePhoto(file);
    if (fileError) return NextResponse.json({ error: fileError }, { status: 400 });

    await setChatPhoto(telegramAccountId, chat, { name: file.name || "photo.jpg", data: Buffer.from(await file.arrayBuffer()) });
    invalidatePhoto(photoKey(telegramAccountId, "chat", chat.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return err instanceof ChatError ? NextResponse.json({ error: err.message }, { status: 400 }) : errorResponse(err);
  }
});

/** DELETE: removes the chat's photo. */
export const DELETE = withAuth(async (_req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const chat = getChatById(Number((await ctx.params).id), telegramAccountId);
    if (!chat) return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    await deleteChatPhoto(telegramAccountId, chat);
    invalidatePhoto(photoKey(telegramAccountId, "chat", chat.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return err instanceof ChatError ? NextResponse.json({ error: err.message }, { status: 400 }) : errorResponse(err);
  }
});
