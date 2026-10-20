import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { botApiChatId, deleteChat, editChat, getChatById, getChatDetail } from "@/lib/chats";
import { validateChatAbout, validateChatTitle, validateChatUsername } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth(async (_req: Request, ctx: Ctx, userId: string) => {
  try {
    const { id } = await ctx.params;
    const chat = await getChatById(Number(id), userId);
    if (!chat) return NextResponse.json({ error: "Chat not found." }, { status: 404 });

    const { row, detail } = await getChatDetail(userId, chat);
    return NextResponse.json({
      id: row.id,
      telegramId: row.telegramId,
      botApiId: botApiChatId(row),
      kind: row.kind,
      title: row.title,
      username: row.username,
      isCreator: row.isCreator,
      ...detail,
    });
  } catch (err) {
    return errorResponse(err);
  }
});

/** PATCH: update one or more of title / about / username. Body is a sparse set of fields. */
export const PATCH = withAuth(async (req: Request, ctx: Ctx, userId: string) => {
  try {
    const { id } = await ctx.params;
    const chat = await getChatById(Number(id), userId);
    if (!chat) return NextResponse.json({ error: "Chat not found." }, { status: 404 });

    const body = await req.json();
    const changes: { title?: string; about?: string; username?: string } = {};

    if (typeof body.title === "string") {
      const error = validateChatTitle(body.title);
      if (error) return NextResponse.json({ error }, { status: 400 });
      changes.title = body.title.trim();
    }
    if (typeof body.about === "string") {
      const error = validateChatAbout(body.about);
      if (error) return NextResponse.json({ error }, { status: 400 });
      changes.about = body.about;
    }
    if (typeof body.username === "string") {
      const error = validateChatUsername(body.username);
      if (error) return NextResponse.json({ error }, { status: 400 });
      changes.username = body.username.trim().replace(/^@/, "");
    }

    const applied = await editChat(userId, chat, changes);
    return NextResponse.json({ ok: true, applied });
  } catch (err) {
    return errorResponse(err, 400);
  }
});

/** DELETE: permanently deletes the channel/group on Telegram (creator only). */
export const DELETE = withAuth(async (_req: Request, ctx: Ctx, userId: string) => {
  try {
    const { id } = await ctx.params;
    const chat = await getChatById(Number(id), userId);
    if (!chat) return NextResponse.json({ error: "Chat not found." }, { status: 404 });

    await deleteChat(userId, chat);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
