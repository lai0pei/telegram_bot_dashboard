import { NextResponse } from "next/server";
import { withGate, errorResponse } from "@/lib/api-guard";
import { createSessionCookie, getLoginIdCookie } from "@/lib/auth";
import { submitLoginPassword } from "@/lib/mtproto";

export const POST = withGate(async (req: Request) => {
  try {
    const { password } = await req.json();
    if (typeof password !== "string" || !password) {
      return NextResponse.json({ error: "Password is required." }, { status: 400 });
    }
    const loginId = await getLoginIdCookie();
    if (!loginId) {
      return NextResponse.json({ error: "No login in progress. Request a new code first." }, { status: 400 });
    }

    const result = await submitLoginPassword(loginId, password);
    if (result.status === "logged_in") {
      await createSessionCookie(result.userId);
      return NextResponse.json({ ok: true });
    }
    if (result.status === "not_allowed") {
      return NextResponse.json(
        { error: "This Telegram account isn't allowed to use this dashboard.", telegramUserId: result.userId },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: "Unexpected login state." }, { status: 400 });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
