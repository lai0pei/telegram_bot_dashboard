import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

/**
 * Two cookies:
 * - SESSION_COOKIE: set once a dashboard user logs in. Carries `sub` (the
 *   dashboard user's ID), `ver` (that user's sessionVersion, so changing the
 *   password invalidates every other signed-in device), and
 *   `activeTelegramAccountId` (which linked Telegram account bot/chat routes
 *   act as — null until one is bound). Re-signed whenever the active account
 *   changes, so one write keeps all three claims consistent.
 * - LOGIN_ID_COOKIE: carries the in-progress phone/code/2FA login's loginId
 *   across its steps.
 */
const SESSION_COOKIE = "tgdash_session";
const LOGIN_ID_COOKIE = "tgdash_login_id";
const ALG = "HS256";

function getSecretKey() {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error("APP_SECRET is not set.");
  return new TextEncoder().encode(secret);
}

/** Optional allowlist of Telegram user IDs permitted to be linked. Empty = anyone can link any account. */
export function isTelegramUserAllowed(telegramUserId: string): boolean {
  const raw = process.env.ALLOWED_TELEGRAM_USER_IDS;
  if (!raw || !raw.trim()) return true;
  const allowed = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return allowed.includes(telegramUserId);
}

export async function createSessionCookie(
  userId: string,
  sessionVersion: number,
  activeTelegramAccountId: string | null
) {
  const token = await new SignJWT({ sub: userId, ver: sessionVersion, activeTelegramAccountId })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecretKey());

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Carries the in-progress login's loginId across the phone/code/password steps. Not signed: it's an opaque ID, not a credential. */
export async function setLoginIdCookie(loginId: string) {
  const store = await cookies();
  store.set(LOGIN_ID_COOKIE, loginId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });
}

export async function getLoginIdCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(LOGIN_ID_COOKIE)?.value ?? null;
}

export async function clearLoginIdCookie() {
  const store = await cookies();
  store.delete(LOGIN_ID_COOKIE);
}

interface SessionClaims {
  userId: string;
  sessionVersion: number;
  activeTelegramAccountId: string | null;
}

async function readSessionClaims(): Promise<SessionClaims | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    return {
      userId: payload.sub,
      sessionVersion: typeof payload.ver === "number" ? payload.ver : 0,
      activeTelegramAccountId:
        typeof payload.activeTelegramAccountId === "string" ? payload.activeTelegramAccountId : null,
    };
  } catch {
    return null;
  }
}

/** Returns the logged-in dashboard user's ID, or null if there isn't one. Does not check sessionVersion. */
export async function getCurrentUserId(): Promise<string | null> {
  const claims = await readSessionClaims();
  return claims?.userId ?? null;
}

export { readSessionClaims, SESSION_COOKIE };
