import { NextResponse } from "next/server";
import { readSessionClaims } from "./auth";
import { getTelegramAccountById } from "./telegram-accounts";
import { getUserById } from "./users";
import { getClientIp, rateLimit } from "./rate-limit";

type RouteContext = { params: Promise<Record<string, string>> };

/**
 * Wraps a route handler so it 401s unless a dashboard session is active
 * (and that session's sessionVersion still matches the user's current one —
 * a password change bumps it, signing out every other device), and passes
 * that user's ID as the last argument. Used by routes that need to know who
 * the dashboard user is but don't need a specific Telegram account selected:
 * account management, /api/me, logout, and the Telegram-account-linking
 * wizard (binding an account is how a selected one gets created).
 */
export function withSession<Ctx extends RouteContext = RouteContext>(
  handler: (req: Request, ctx: Ctx, userId: string) => Promise<Response>
): (req: Request, ctx: Ctx) => Promise<Response> {
  return async (req: Request, ctx: Ctx) => {
    const claims = await readSessionClaims();
    if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = getUserById(claims.userId);
    if (!user || user.sessionVersion !== claims.sessionVersion) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handler(req, ctx, claims.userId);
  };
}

/**
 * Wraps a route handler so it 401s unless a dashboard session is active, and
 * 409s with NO_ACTIVE_ACCOUNT unless that session also has a linked Telegram
 * account selected as active. Passes that account's ID (what bots/chats'
 * ownerUserId points at) as the last argument. Used by every route that
 * touches a specific Telegram account's bots, chats, or live client.
 *
 * Re-validates the active-account claim against the DB on every request
 * (one indexed lookup) so a stale claim — the account was unbound in
 * another tab since this cookie was issued — can't silently keep working.
 */
export function withAuth<Ctx extends RouteContext = RouteContext>(
  handler: (req: Request, ctx: Ctx, telegramAccountId: string) => Promise<Response>
): (req: Request, ctx: Ctx) => Promise<Response> {
  return async (req: Request, ctx: Ctx) => {
    const claims = await readSessionClaims();
    if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = getUserById(claims.userId);
    if (!user || user.sessionVersion !== claims.sessionVersion) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!claims.activeTelegramAccountId) {
      return NextResponse.json(
        { error: "No Telegram account is active.", code: "NO_ACTIVE_ACCOUNT" },
        { status: 409 }
      );
    }
    const account = getTelegramAccountById(claims.activeTelegramAccountId);
    if (!account || account.ownerUserId !== claims.userId) {
      return NextResponse.json(
        { error: "No Telegram account is active.", code: "NO_ACTIVE_ACCOUNT" },
        { status: 409 }
      );
    }
    return handler(req, ctx, account.id);
  };
}

/** Wraps a route handler with a fixed-window rate limit keyed by client IP. */
export function withRateLimit(
  handler: (req: Request) => Promise<Response>,
  options: { key: string; limit: number; windowMs: number }
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const ip = getClientIp(req);
    if (!rateLimit(`${options.key}:${ip}`, options.limit, options.windowMs)) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }
    return handler(req);
  };
}

export function errorResponse(err: unknown, fallbackStatus = 500): Response {
  const message = err instanceof Error ? err.message : String(err);
  console.error(err);
  return NextResponse.json({ error: message }, { status: fallbackStatus });
}
