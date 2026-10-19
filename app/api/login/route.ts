import { NextResponse } from "next/server";
import { withRateLimit, errorResponse } from "@/lib/api-guard";
import { createSessionCookie } from "@/lib/auth";
import { verifyUserCredentials } from "@/lib/users";
import { listTelegramAccountsForUser } from "@/lib/telegram-accounts";
import { rateLimit } from "@/lib/rate-limit";

/** Dashboard username/password login, rate-limited by IP and by username so one account can't be brute-forced from many IPs. */
export const POST = withRateLimit(
  async (req: Request) => {
    try {
      const { username, password } = await req.json();
      if (typeof username !== "string" || typeof password !== "string") {
        return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
      }
      if (!rateLimit(`login-user:${username.trim().toLowerCase()}`, 10, 10 * 60 * 1000)) {
        return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
      }

      const user = verifyUserCredentials(username, password);
      if (!user) {
        return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
      }

      const accounts = listTelegramAccountsForUser(user.id);
      const defaultAccountId =
        accounts.slice().sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]?.id ?? null;

      await createSessionCookie(user.id, user.sessionVersion, defaultAccountId);
      return NextResponse.json({ ok: true });
    } catch (err) {
      return errorResponse(err, 400);
    }
  },
  { key: "login", limit: 20, windowMs: 10 * 60 * 1000 }
);
