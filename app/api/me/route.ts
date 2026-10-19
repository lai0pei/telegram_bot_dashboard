import { NextResponse } from "next/server";
import { withSession, errorResponse } from "@/lib/api-guard";
import { readSessionClaims } from "@/lib/auth";
import { getClient, isLoggedIn } from "@/lib/mtproto";
import { Api } from "teleproto/tl";

export const GET = withSession(async () => {
  try {
    const claims = await readSessionClaims();
    const accountId = claims?.activeTelegramAccountId ?? null;
    if (!accountId || !isLoggedIn(accountId)) {
      return NextResponse.json({ hasActiveAccount: false, loggedIn: false });
    }
    const client = await getClient(accountId);
    if (!client) return NextResponse.json({ hasActiveAccount: false, loggedIn: false });

    const me = (await client.getMe()) as Api.User;
    return NextResponse.json({
      hasActiveAccount: true,
      loggedIn: true,
      id: me.id.toString(),
      chatId: me.id.toString(),
      username: me.username ?? null,
      firstName: me.firstName ?? null,
      lastName: me.lastName ?? null,
      phone: me.phone ?? null,
      premium: me.premium ?? false,
    });
  } catch (err) {
    return errorResponse(err);
  }
});
