import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { submitLoginPassword } from "@/lib/mtproto";

export const POST = withAuth(async (req: Request) => {
  try {
    const { password } = await req.json();
    if (typeof password !== "string" || !password) {
      return NextResponse.json({ error: "Password is required." }, { status: 400 });
    }
    await submitLoginPassword(password);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
