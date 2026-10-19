import { NextResponse } from "next/server";
import { checkDashboardPassword, createGateCookie } from "@/lib/auth";
import { errorResponse } from "@/lib/api-guard";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

/** First gate: the shared dashboard password. Sets a short-lived cookie that only unlocks the Telegram login steps. */
export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    if (!rateLimit(`dashboard-login:${ip}`, 20, 10 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    const { password } = await req.json();
    if (typeof password !== "string" || !checkDashboardPassword(password)) {
      return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
    }
    await createGateCookie();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 400);
  }
}
