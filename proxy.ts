import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Edge-runtime gate: redirects requests for dashboard pages to /login unless
 * a signed-in Telegram session cookie (carrying `sub`, the Telegram user ID)
 * is present. API routes enforce auth themselves (lib/api-guard.ts) since
 * some mutate state and want a JSON 401 rather than a redirect.
 */
const SESSION_COOKIE = "tgdash_session";
const PUBLIC_PATHS = ["/login", "/api/dashboard-login"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.APP_SECRET;
  if (token && secret) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
      if (typeof payload.sub === "string" && payload.sub) {
        return NextResponse.next();
      }
    } catch {
      // fall through to redirect
    }
  }

  const loginUrl = new URL("/login", req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
