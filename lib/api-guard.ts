import { NextResponse } from "next/server";
import { getCurrentUserId, hasPassedGate } from "./auth";
import { getClientIp, rateLimit } from "./rate-limit";

type RouteContext = { params: Promise<Record<string, string>> };

/**
 * Wraps a route handler so it 401s unless the dashboard-password gate has
 * been passed, and rate-limits by IP (these run before a Telegram session
 * exists, so they're the endpoints most worth protecting from brute force).
 * Used only by the login-flow routes (/api/auth/*), none of which are
 * dynamic routes, so no params/ctx to forward.
 */
export function withGate(
  handler: (req: Request) => Promise<Response>
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const ip = getClientIp(req);
    if (!rateLimit(`gate:${ip}`, 20, 10 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }
    if (!(await hasPassedGate()) && !(await getCurrentUserId())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handler(req);
  };
}

/**
 * Wraps a route handler so it 401s unless a Telegram session is active, and
 * passes that session's Telegram user ID as the last argument. Used by every
 * route that touches a specific user's bots or account. Takes an explicit
 * (req, ctx?) shape — matching exactly what Next.js's router calls a route
 * handler with — rather than inferring arity from the wrapped handler, so
 * the forwarded `ctx` can never be mistaken for the appended `userId`.
 */
export function withAuth<Ctx extends RouteContext = RouteContext>(
  handler: (req: Request, ctx: Ctx, userId: string) => Promise<Response>
): (req: Request, ctx: Ctx) => Promise<Response> {
  return async (req: Request, ctx: Ctx) => {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handler(req, ctx, userId);
  };
}

export function errorResponse(err: unknown, fallbackStatus = 500): Response {
  const message = err instanceof Error ? err.message : String(err);
  console.error(err);
  return NextResponse.json({ error: message }, { status: fallbackStatus });
}
