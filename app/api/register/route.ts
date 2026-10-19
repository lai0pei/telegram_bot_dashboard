import { NextResponse } from "next/server";
import { withRateLimit, errorResponse } from "@/lib/api-guard";
import { createSessionCookie } from "@/lib/auth";
import { createUser, UsernameTakenError } from "@/lib/users";
import { validateDashboardUsername, validateDashboardPassword } from "@/lib/validation";

export const POST = withRateLimit(
  async (req: Request) => {
    try {
      if (process.env.REGISTRATION_ENABLED === "false") {
        return NextResponse.json({ error: "Registration is closed." }, { status: 403 });
      }

      const { username, password } = await req.json();
      if (typeof username !== "string" || typeof password !== "string") {
        return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
      }
      const usernameError = validateDashboardUsername(username);
      if (usernameError) return NextResponse.json({ error: usernameError }, { status: 400 });
      const passwordError = validateDashboardPassword(password);
      if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

      const user = createUser(username, password);
      await createSessionCookie(user.id, user.sessionVersion, null);
      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof UsernameTakenError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      return errorResponse(err, 400);
    }
  },
  { key: "register", limit: 10, windowMs: 10 * 60 * 1000 }
);
