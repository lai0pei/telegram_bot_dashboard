import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { startLogin } from "@/lib/mtproto";

export const POST = withAuth(async (req: Request) => {
  try {
    const { phoneNumber } = await req.json();
    if (typeof phoneNumber !== "string" || !phoneNumber.trim()) {
      return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
    }
    await startLogin(phoneNumber.trim());
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
