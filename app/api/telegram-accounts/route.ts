import { NextResponse } from "next/server";
import { withSession, errorResponse } from "@/lib/api-guard";
import { readSessionClaims } from "@/lib/auth";
import { listTelegramAccountsForUser } from "@/lib/telegram-accounts";

/** GET: lists the dashboard user's linked Telegram accounts and which one is active. Binding a new account goes through /api/auth/send-code, not a POST here, so there's exactly one code path that creates rows. */
export const GET = withSession(async (_req, _ctx, userId) => {
  try {
    const claims = await readSessionClaims();
    const accounts = listTelegramAccountsForUser(userId);
    return NextResponse.json({
      accounts: accounts.map((a) => ({
        id: a.id,
        telegramId: a.telegramId,
        username: a.username,
        firstName: a.firstName,
        lastName: a.lastName,
        phone: a.phone,
        isActive: a.id === claims?.activeTelegramAccountId,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
});
