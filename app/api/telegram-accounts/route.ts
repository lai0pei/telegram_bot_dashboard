import { NextResponse } from "next/server";
import { withSession, errorResponse } from "@/lib/api-guard";
import { createSessionCookie, readSessionClaims } from "@/lib/auth";
import { checkTelegramSession } from "@/lib/mtproto";
import { getTelegramAccountById, listTelegramAccountsForUser, pickDefaultTelegramAccountId } from "@/lib/telegram-accounts";
import { getUserById } from "@/lib/users";

/** Caps how long a slow/unreachable Telegram can hold up the sidebar. */
const SESSION_CHECK_BUDGET_MS = 5_000;

/**
 * GET: lists the dashboard user's linked Telegram accounts and which one is
 * active, after probing each live session so one ended from the phone shows
 * up as revoked. If the active account turned out revoked (or is gone), the
 * session cookie is re-signed onto another live account, or none. Binding a
 * new account goes through /api/auth/qr, not a POST here, so there's exactly
 * one code path that creates rows.
 */
export const GET = withSession(async (_req, _ctx, userId) => {
  try {
    const live = (await listTelegramAccountsForUser(userId)).filter((a) => !a.revokedAt);
    await Promise.race([
      Promise.all(live.map((a) => checkTelegramSession(a.id))),
      new Promise((resolve) => setTimeout(resolve, SESSION_CHECK_BUDGET_MS)),
    ]);

    const claims = await readSessionClaims();
    let activeId = claims?.activeTelegramAccountId ?? null;
    let activeChanged = false;
    if (activeId) {
      const active = await getTelegramAccountById(activeId);
      if (!active || active.ownerUserId !== userId || active.revokedAt) {
        activeId = await pickDefaultTelegramAccountId(userId);
        activeChanged = true;
        const user = await getUserById(userId);
        await createSessionCookie(userId, user?.sessionVersion ?? 0, activeId);
      }
    }

    const accounts = await listTelegramAccountsForUser(userId);
    return NextResponse.json({
      // Tells the client the cookie was just re-pointed, so a page already
      // loaded as the old account must reload — even on the very first fetch.
      activeChanged,
      accounts: accounts.map((a) => ({
        id: a.id,
        telegramId: a.telegramId,
        username: a.username,
        firstName: a.firstName,
        lastName: a.lastName,
        phone: a.phone,
        isActive: a.id === activeId,
        revoked: !!a.revokedAt,
        digestFrequency: a.digestFrequency,
        digestHour: a.digestHour,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
});
