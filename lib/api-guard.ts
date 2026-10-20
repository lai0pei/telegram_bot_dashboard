import { NextResponse } from "next/server";
import { readSessionClaims } from "./auth";
import { getTelegramAccountById, TelegramSessionRevokedError } from "./telegram-accounts";
import { getUserById, touchLastActive } from "./users";
import { isAdminUser } from "./admin";
import { BotApiError } from "./botapi";
import { logError } from "./error-log";
import { getClientIp, rateLimit } from "./rate-limit";
import { BotHeldByAnotherAccountError, TokenBotTokenError } from "./token-bot";

type RouteContext = { params: Promise<Record<string, string>> };

/**
 * Wraps a route handler so it 401s unless a dashboard session is active
 * (and that session's sessionVersion still matches the user's current one —
 * "sign out other browsers" bumps it, invalidating every other device's
 * cookie), and passes that user's ID as the last argument. Used by routes
 * that need to know who the dashboard user is but don't need a specific
 * Telegram account selected: account management, /api/me, logout, and the
 * Telegram-account-linking wizard (binding an account is how a selected one
 * gets created).
 */
export function withSession<Ctx extends RouteContext = RouteContext>(
  handler: (req: Request, ctx: Ctx, userId: string) => Promise<Response>
): (req: Request, ctx: Ctx) => Promise<Response> {
  return async (req: Request, ctx: Ctx) => {
    const claims = await readSessionClaims();
    if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = await getUserById(claims.userId);
    // A suspended user's sessions are also invalidated when they're suspended (sessionVersion bump); this is the backstop. 401 on purpose: the client already turns it into "back to the sign-in page".
    if (!user || user.sessionVersion !== claims.sessionVersion || user.suspendedAt) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    touchLastActive(user.id);
    return handler(req, ctx, claims.userId);
  };
}

/**
 * Like withSession, but only for the master admin (lib/admin.ts). Answers 403
 * `NOT_ADMIN` rather than 401, which the client treats as a dead dashboard
 * session, or 409, which is reserved for NO_ACTIVE_ACCOUNT/SESSION_REVOKED.
 * Admin routes are cross-tenant by design, so every one of them must go
 * through this wrapper (they all live under app/api/admin/).
 */
export function withAdmin<Ctx extends RouteContext = RouteContext>(
  handler: (req: Request, ctx: Ctx, userId: string) => Promise<Response>
): (req: Request, ctx: Ctx) => Promise<Response> {
  return withSession<Ctx>(async (req, ctx, userId) => {
    if (!(await isAdminUser(userId))) {
      return NextResponse.json({ error: "Forbidden", code: "NOT_ADMIN" }, { status: 403 });
    }
    return handler(req, ctx, userId);
  });
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
    const user = await getUserById(claims.userId);
    // A suspended user's sessions are also invalidated when they're suspended (sessionVersion bump); this is the backstop. 401 on purpose: the client already turns it into "back to the sign-in page".
    if (!user || user.sessionVersion !== claims.sessionVersion || user.suspendedAt) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!claims.activeTelegramAccountId) {
      return NextResponse.json(
        { error: "No Telegram account is active.", code: "NO_ACTIVE_ACCOUNT" },
        { status: 409 }
      );
    }
    const account = await getTelegramAccountById(claims.activeTelegramAccountId);
    if (!account || account.ownerUserId !== claims.userId) {
      return NextResponse.json(
        { error: "No Telegram account is active.", code: "NO_ACTIVE_ACCOUNT" },
        { status: 409 }
      );
    }
    if (account.revokedAt) return sessionRevokedResponse();
    touchLastActive(user.id);
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

/** The client reacts to this code by re-syncing the account list (lib/api-client.ts). */
function sessionRevokedResponse(): Response {
  return NextResponse.json(
    { error: new TelegramSessionRevokedError().message, code: "SESSION_REVOKED" },
    { status: 409 }
  );
}

export function errorResponse(err: unknown, fallbackStatus = 500): Response {
  if (err instanceof TelegramSessionRevokedError) return sessionRevokedResponse();
  // Token-added bots: a rejected token or a bot another account holds is something the person can fix, not a server error.
  if (err instanceof TokenBotTokenError || err instanceof BotHeldByAnotherAccountError) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }
  const message = err instanceof Error ? err.message : String(err);
  // Only responses that are server errors are stored: routes pass a 4xx fallback for failures the person caused or can
  // fix, and a Bot API 4xx is Telegram refusing a request, neither of which is a bug to chase.
  const expected = fallbackStatus < 500 || (err instanceof BotApiError && (err.errorCode ?? 500) < 500);
  if (expected) console.error(err);
  else logError("api", "route handler failed", err);
  return NextResponse.json({ error: message }, { status: fallbackStatus });
}
