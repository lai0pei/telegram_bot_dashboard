import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { getBotById, getBotToken } from "@/lib/bots";
import { botApi, type ChatAdministratorRights } from "@/lib/botapi";

type Ctx = { params: Promise<{ id: string }> };

const RIGHT_KEYS: (keyof ChatAdministratorRights)[] = [
  "is_anonymous",
  "can_manage_chat",
  "can_delete_messages",
  "can_manage_video_chats",
  "can_restrict_members",
  "can_promote_members",
  "can_change_info",
  "can_invite_users",
  "can_post_messages",
  "can_edit_messages",
  "can_pin_messages",
  "can_manage_topics",
];

async function resolve(ctx: Ctx, userId: string) {
  const { id } = await ctx.params;
  const bot = getBotById(Number(id), userId);
  if (!bot) return { error: NextResponse.json({ error: "Bot not found." }, { status: 404 }) };
  const token = getBotToken(bot);
  if (!token) return { error: NextResponse.json({ error: "No token stored for this bot." }, { status: 400 }) };
  return { token };
}

/** GET: the rights Telegram suggests when the bot is added as admin to groups and to channels. */
export const GET = withAuth(async (_req: Request, ctx: Ctx, userId: string) => {
  try {
    const r = await resolve(ctx, userId);
    if (r.error) return r.error;
    const [groups, channels] = await Promise.all([
      botApi.getMyDefaultAdministratorRights(r.token, false),
      botApi.getMyDefaultAdministratorRights(r.token, true),
    ]);
    return NextResponse.json({ groups, channels });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err, 400);
  }
});

/** PUT { forChannels, rights }: saves one of the two sets. Only known boolean can_* flags are forwarded. */
export const PUT = withAuth(async (req: Request, ctx: Ctx, userId: string) => {
  try {
    const r = await resolve(ctx, userId);
    if (r.error) return r.error;
    const body = await req.json();
    if (!body.rights || typeof body.rights !== "object") {
      return NextResponse.json({ error: "Rights are required." }, { status: 400 });
    }
    const rights: ChatAdministratorRights = {};
    for (const key of RIGHT_KEYS) {
      if (typeof body.rights[key] === "boolean") rights[key] = body.rights[key];
    }
    await botApi.setMyDefaultAdministratorRights(r.token, rights, Boolean(body.forChannels));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err, 400);
  }
});
