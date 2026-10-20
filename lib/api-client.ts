/** Thrown by apiFetch on a non-2xx response. Carries the full JSON body so callers can read extra fields. */
export class ApiError extends Error {
  constructor(message: string, public body: Record<string, unknown>) {
    super(message);
  }
}

/** Thin fetch wrapper for client components: JSON body, throws on non-2xx with the server's error message. */
export async function apiFetch<T = unknown>(
  url: string,
  options?: { method?: string; body?: unknown }
): Promise<T> {
  // A FormData body goes as-is: the browser sets the multipart Content-Type (with its boundary) itself.
  const isForm = typeof FormData !== "undefined" && options?.body instanceof FormData;
  const res = await fetch(url, {
    method: options?.method ?? (options?.body ? "POST" : "GET"),
    headers: options?.body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: options?.body ? (isForm ? (options.body as FormData) : JSON.stringify(options.body)) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) endDeadSession();
    if (json.code === "SESSION_REVOKED") notifyAccountsChanged();
    throw new ApiError(json.error ?? `Request to ${url} failed with status ${res.status}`, json);
  }
  return json as T;
}

let endingSession = false;

/**
 * A 401 means the dashboard session cookie no longer works (expired, signed
 * out from another browser, or its user is gone). The page gate in proxy.ts
 * only checks the cookie's signature, so without this the dashboard would
 * keep rendering and every call would fail. Clear the cookie and go sign in.
 */
function endDeadSession() {
  if (typeof window === "undefined" || endingSession || window.location.pathname.startsWith("/login")) return;
  endingSession = true;
  void fetch("/api/auth/logout", { method: "POST" }).finally(() =>
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload on purpose: drops all client state (account list, cached /api/me) of the dead session; not a component, so no router here
    window.location.assign("/login")
  );
}

/** Window event the dashboard's AccountsProvider listens for to re-fetch the linked-account list. */
export const ACCOUNTS_CHANGED_EVENT = "tgdash:accounts-changed";

export function notifyAccountsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ACCOUNTS_CHANGED_EVENT));
}

export interface Me {
  hasActiveAccount: boolean;
  loggedIn: boolean;
  id?: string;
  chatId?: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  premium?: boolean;
}

export interface TelegramAccountSummary {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  isActive: boolean;
  /** The Telegram session was ended elsewhere (e.g. from the phone); re-link by QR to restore it. */
  revoked: boolean;
  digestFrequency: "off" | "daily" | "weekly";
  digestHour: number;
}

let mePromise: Promise<Me> | null = null;

/**
 * Fetches /api/me, sharing one in-flight (and then cached) request across
 * callers in the same page load — AccountBadge and the overview page both
 * need it. Call clearMeCache() after login/logout so the next call refetches.
 */
export function getMe(): Promise<Me> {
  return (mePromise ??= apiFetch<Me>("/api/me").catch((err) => {
    mePromise = null;
    throw err;
  }));
}

export function clearMeCache() {
  mePromise = null;
}
