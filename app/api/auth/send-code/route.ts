import { NextResponse } from "next/server";
import { withGate, errorResponse } from "@/lib/api-guard";
import { setLoginIdCookie } from "@/lib/auth";
import { startLogin } from "@/lib/mtproto";

export const POST = withGate(async (req: Request) => {
  try {
    const { phoneNumber } = await req.json();
    if (typeof phoneNumber !== "string" || !phoneNumber.trim()) {
      return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
    }
    const { loginId } = await startLogin(phoneNumber.trim());
    await setLoginIdCookie(loginId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
