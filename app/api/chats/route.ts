import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { botApiChatId, createChat, syncChats, type ChatRow } from "@/lib/chats";
import { singleFlight } from "@/lib/single-flight";
import { validateChatAbout, validateChatTitle } from "@/lib/validation";

function summarize(chat: ChatRow) {
  return {
    id: chat.id,
    telegramId: chat.telegramId,
    botApiId: botApiChatId(chat),
    kind: chat.kind,
    title: chat.title,
    username: chat.username,
    isCreator: chat.isCreator,
  };
}

/** GET: syncs the current user's channels/groups from their dialogs, then returns those they own or admin. */
export const GET = withAuth(async (_req, _ctx, userId) => {
  try {
    const rows = await syncChats(userId);
    return NextResponse.json({ chats: rows.map(summarize) });
  } catch (err) {
    return errorResponse(err);
  }
});

/** POST: creates a new channel or supergroup owned by the current user. */
export const POST = withAuth(async (req, _ctx, userId) => {
  try {
    const { kind, title, about = "" } = await req.json();
    if (kind !== "channel" && kind !== "supergroup") {
      return NextResponse.json({ error: 'Kind must be "channel" or "supergroup".' }, { status: 400 });
    }
    if (typeof title !== "string" || typeof about !== "string") {
      return NextResponse.json({ error: "Title is required." }, { status: 400 });
    }
    const titleError = validateChatTitle(title);
    if (titleError) return NextResponse.json({ error: titleError }, { status: 400 });
    const aboutError = validateChatAbout(about);
    if (aboutError) return NextResponse.json({ error: aboutError }, { status: 400 });

    const row = await singleFlight(`create-chat:${userId}:${kind}:${title.trim().toLowerCase()}`, () =>
      createChat(userId, { kind, title: title.trim(), about })
    );
    return NextResponse.json({ ok: true, ...summarize(row) });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
