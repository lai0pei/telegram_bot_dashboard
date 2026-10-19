import { NextResponse } from "next/server";
import { withGate, errorResponse } from "@/lib/api-guard";
import { createSessionCookie, getLoginIdCookie } from "@/lib/auth";
import { submitLoginCode } from "@/lib/mtproto";

export const POST = withGate(async (req: Request) => {
  try {
    const { code } = await req.json();
    if (typeof code !== "string" || !code.trim()) {
      return NextResponse.json({ error: "Code is required." }, { status: 400 });
    }
    const loginId = await getLoginIdCookie();
    if (!loginId) {
      return NextResponse.json({ error: "No login in progress. Request a new code first." }, { status: 400 });
    }

    const result = await submitLoginCode(loginId, code.trim());
    if (result.status === "logged_in") {
      await createSessionCookie(result.userId);
      return NextResponse.json({ status: "logged_in" });
    }
    if (result.status === "not_allowed") {
      return NextResponse.json(
        { error: "This Telegram account isn't allowed to use this dashboard.", telegramUserId: result.userId },
        { status: 403 }
      );
    }
    return NextResponse.json({ status: result.status });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
