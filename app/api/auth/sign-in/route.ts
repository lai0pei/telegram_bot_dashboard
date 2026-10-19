import { NextResponse } from "next/server";
import { withSession, errorResponse } from "@/lib/api-guard";
import { createSessionCookie, getLoginIdCookie, readSessionClaims } from "@/lib/auth";
import { submitLoginCode } from "@/lib/mtproto";
import { getUserById } from "@/lib/users";

export const POST = withSession(async (req, _ctx, userId) => {
  try {
    const { code } = await req.json();
    if (typeof code !== "string" || !code.trim()) {
      return NextResponse.json({ error: "Code is required." }, { status: 400 });
    }
    const loginId = await getLoginIdCookie();
    if (!loginId) {
      return NextResponse.json({ error: "No login in progress. Request a new code first." }, { status: 400 });
    }

    const result = await submitLoginCode(loginId, code.trim(), userId);
    if (result.status === "logged_in") {
      const user = getUserById(userId);
      await createSessionCookie(userId, user?.sessionVersion ?? 0, result.accountId);
      return NextResponse.json({ status: "logged_in" });
    }
    if (result.status === "not_allowed") {
      return NextResponse.json(
        { error: "This Telegram account isn't allowed to use this dashboard.", telegramUserId: result.telegramId },
        { status: 403 }
      );
    }
    if (result.status === "already_linked") {
      return NextResponse.json(
        { error: "This Telegram account is already linked to a different dashboard user." },
        { status: 409 }
      );
    }
    return NextResponse.json({ status: result.status });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
