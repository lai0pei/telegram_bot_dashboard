import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

/**
 * Two cookies:
 * - GATE_COOKIE: set once the shared dashboard password is correct. Lets the
 *   browser reach the Telegram login steps (/api/auth/*), nothing else.
 * - SESSION_COOKIE: set once Telegram login completes. Carries `sub`, the
 *   Telegram user ID, which scopes every bot/account lookup to that user.
 */
const GATE_COOKIE = "tgdash_gate";
const SESSION_COOKIE = "tgdash_session";
const LOGIN_ID_COOKIE = "tgdash_login_id";
const ALG = "HS256";

function getSecretKey() {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error("APP_SECRET is not set.");
  return new TextEncoder().encode(secret);
}

/** Checks the submitted dashboard password against DASHBOARD_PASSWORD. */
export function checkDashboardPassword(password: string): boolean {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) throw new Error("DASHBOARD_PASSWORD is not set.");
  return password === expected;
}

/** Optional allowlist of Telegram user IDs permitted to log in. Empty = anyone past the gate. */
export function isTelegramUserAllowed(telegramUserId: string): boolean {
  const raw = process.env.ALLOWED_TELEGRAM_USER_IDS;
  if (!raw || !raw.trim()) return true;
  const allowed = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return allowed.includes(telegramUserId);
}

export async function createGateCookie() {
  const token = await new SignJWT({ gate: true })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(getSecretKey());

  const store = await cookies();
  store.set(GATE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 30,
  });
}

export async function hasPassedGate(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(GATE_COOKIE)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, getSecretKey());
    return true;
  } catch {
    return false;
  }
}

export async function createSessionCookie(telegramUserId: string) {
  const token = await new SignJWT({ sub: telegramUserId })
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
  // The gate cookie has done its job once a real session exists.
  store.delete(GATE_COOKIE);
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

/** Returns the logged-in Telegram user's ID, or null if there isn't one. */
export async function getCurrentUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export { GATE_COOKIE, SESSION_COOKIE };
