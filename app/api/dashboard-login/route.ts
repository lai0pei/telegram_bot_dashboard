import { NextResponse } from "next/server";
import { checkDashboardPassword, createAuthCookie } from "@/lib/auth";
import { errorResponse } from "@/lib/api-guard";

/** First gate: the single dashboard password. Sets the session cookie. */
export async function POST(req: Request) {
  try {
    const { password } = await req.json();
    if (typeof password !== "string" || !checkDashboardPassword(password)) {
      return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
    }
    await createAuthCookie();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 400);
  }
}
