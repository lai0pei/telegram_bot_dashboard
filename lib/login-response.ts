import { NextResponse } from "next/server";
import { createSessionCookie } from "./auth";
import { getUserById } from "./users";
import type { QrLoginStatus } from "./mtproto";

/**
 * Maps a QR/password login outcome to its HTTP response, shared by the
 * sign-in routes (app/api/login/*, no dashboard user yet) and the
 * account-linking routes (app/api/auth/*, binding an extra account to the
 * caller's existing dashboard user). On success it (re-)signs the session
 * cookie for the outcome's dashboard user with the scanned account active —
 * in link mode that's the caller themselves, so this just switches their
 * active account.
 */
export async function loginStatusResponse(result: QrLoginStatus): Promise<Response> {
  if (result.status === "logged_in") {
    const user = await getUserById(result.userId);
    await createSessionCookie(result.userId, user?.sessionVersion ?? 0, result.accountId);
    return NextResponse.json({ status: "logged_in" });
  }
  if (result.status === "not_allowed") {
    return NextResponse.json(
      {
        error: "This Telegram account isn't allowed to use this dashboard.",
        code: "NOT_ALLOWED",
        telegramUserId: result.telegramId,
      },
      { status: 403 }
    );
  }
  if (result.status === "already_linked") {
    return NextResponse.json(
      { error: "This Telegram account is already linked to a different dashboard user.", code: "ALREADY_LINKED" },
      { status: 409 }
    );
  }
  if (result.status === "suspended") {
    // telegramUserId makes the password step route this through QrLogin's handleLoginError (generic toast, back to "failed") instead of "wrong password, retry".
    return NextResponse.json(
      {
        error: "This dashboard account has been suspended. Contact the dashboard admin.",
        code: "ACCOUNT_SUSPENDED",
        telegramUserId: result.telegramId,
      },
      { status: 403 }
    );
  }
  if (result.status === "registration_closed") {
    return NextResponse.json(
      {
        error: "This dashboard isn't open for new sign-ups. Ask an admin to link your Telegram account first.",
        code: "REGISTRATION_CLOSED",
        telegramUserId: result.telegramId,
      },
      { status: 403 }
    );
  }
  return NextResponse.json({ status: result.status });
}
