import { NextResponse } from "next/server";
import { withSession, errorResponse } from "@/lib/api-guard";
import { createSessionCookie, readSessionClaims } from "@/lib/auth";
import { getTelegramAccountById, pickDefaultTelegramAccountId, setDigestSettings } from "@/lib/telegram-accounts";
import { unbindTelegramAccount } from "@/lib/unbind-account";
import { getUserById } from "@/lib/users";

type Ctx = { params: Promise<{ id: string }> };

const DIGEST_FREQUENCIES = new Set(["off", "daily", "weekly"]);

/** PATCH: updates this account's digest schedule (how often, and at which UTC hour, a Saved Messages summary goes out). */
export const PATCH = withSession(async (req: Request, ctx: Ctx, userId: string) => {
  try {
    const { id } = await ctx.params;
    const account = await getTelegramAccountById(id);
    if (!account || account.ownerUserId !== userId) {
      return NextResponse.json({ error: "Telegram account not found." }, { status: 404 });
    }

    const body = await req.json();
    if (!DIGEST_FREQUENCIES.has(body.digestFrequency)) {
      return NextResponse.json({ error: "Invalid digest frequency." }, { status: 400 });
    }
    const digestHour = Number(body.digestHour);
    if (!Number.isInteger(digestHour) || digestHour < 0 || digestHour > 23) {
      return NextResponse.json({ error: "Digest hour must be 0-23." }, { status: 400 });
    }

    await setDigestSettings(id, { digestFrequency: body.digestFrequency, digestHour });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 400);
  }
});

/** DELETE: unbinds a Telegram account — ends its Telegram session (best-effort), removes its bots/chats/message history, and if it was the active account, re-signs the session cookie onto another one (or none). */
export const DELETE = withSession(async (_req: Request, ctx: Ctx, userId: string) => {
  try {
    const { id } = await ctx.params;
    const account = await getTelegramAccountById(id);
    if (!account || account.ownerUserId !== userId) {
      return NextResponse.json({ error: "Telegram account not found." }, { status: 404 });
    }

    await unbindTelegramAccount(id);

    const claims = await readSessionClaims();
    let newActiveTelegramAccountId: string | null = claims?.activeTelegramAccountId ?? null;
    if (newActiveTelegramAccountId === id) {
      newActiveTelegramAccountId = await pickDefaultTelegramAccountId(userId);
      const user = await getUserById(userId);
      await createSessionCookie(userId, user?.sessionVersion ?? 0, newActiveTelegramAccountId);
    }

    return NextResponse.json({ ok: true, newActiveTelegramAccountId });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
