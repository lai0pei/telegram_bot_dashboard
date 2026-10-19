import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";
import { Api } from "teleproto/tl";
import { db, sqlite } from "./db";
import { session as sessionTable } from "./db/schema";
import { decrypt, encrypt } from "./crypto";
import { isTelegramUserAllowed } from "./auth";
import { eq } from "drizzle-orm";

/**
 * Per-user state stored on globalThis so it survives Next.js dev hot-reloads
 * and route-handler module re-evaluation within one process. Keyed by
 * Telegram user ID for connected clients, and by a random login ID (held in
 * a short-lived cookie, see /api/auth/send-code) for logins in progress —
 * that way two people logging in at once never clobber each other.
 */
declare global {
  var __tgDashClients: Map<string, TelegramClient> | undefined;
  var __tgDashLoginStates: Map<string, LoginState> | undefined;
}

function getClientsMap(): Map<string, TelegramClient> {
  return (globalThis.__tgDashClients ??= new Map());
}

function getLoginStatesMap(): Map<string, LoginState> {
  return (globalThis.__tgDashLoginStates ??= new Map());
}

function getApiCreds() {
  const apiId = Number(process.env.API_ID);
  const apiHash = process.env.API_HASH;
  if (!apiId || !apiHash) {
    throw new Error("API_ID / API_HASH are not set. Get them from https://my.telegram.org/apps");
  }
  return { apiId, apiHash };
}

const LOGIN_STATE_TTL_MS = 10 * 60 * 1000;

/** In-memory state for one browser's phone -> code -> 2FA login flow. */
interface LoginState {
  client: TelegramClient;
  phoneNumber: string;
  phoneCodeHash: string;
  expiresAt: number;
}

function pruneExpiredLoginStates() {
  const states = getLoginStatesMap();
  const now = Date.now();
  for (const [id, state] of states) {
    if (state.expiresAt < now) {
      state.client.destroy().catch(() => {});
      states.delete(id);
    }
  }
}

export function getPersistedSession(userId: string): string | null {
  const row = db.select().from(sessionTable).where(eq(sessionTable.userId, userId)).all()[0];
  if (!row) return null;
  return decrypt(row.encryptedSessionString);
}

function persistSession(userId: string, sessionString: string, me: Api.User) {
  const now = new Date();
  const existing = db.select().from(sessionTable).where(eq(sessionTable.userId, userId)).all()[0];
  const values = {
    encryptedSessionString: encrypt(sessionString),
    username: me.username ?? null,
    firstName: me.firstName ?? null,
    lastName: me.lastName ?? null,
    phone: me.phone ?? null,
    updatedAt: now,
  };
  if (existing) {
    db.update(sessionTable).set(values).where(eq(sessionTable.userId, userId)).run();
  } else {
    db.insert(sessionTable)
      .values({ userId, ...values, createdAt: now })
      .run();
  }
}

export function clearPersistedSession(userId: string) {
  sqlite.prepare("DELETE FROM session WHERE user_id = ?").run(userId);
  const clients = getClientsMap();
  clients.get(userId)?.destroy().catch(() => {});
  clients.delete(userId);
}

export function isLoggedIn(userId: string): boolean {
  return getPersistedSession(userId) !== null;
}

/** Returns the connected, authorized client for this user, or null if not logged in. */
export async function getClient(userId: string): Promise<TelegramClient | null> {
  const sessionString = getPersistedSession(userId);
  if (!sessionString) return null;

  const clients = getClientsMap();
  const existing = clients.get(userId);
  if (existing?.connected) {
    return existing;
  }

  const { apiId, apiHash } = getApiCreds();
  const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
    connectionRetries: 3,
  });
  await client.connect();
  clients.set(userId, client);
  return client;
}

/** Step 1: send the login code to the given phone number. Returns a loginId to carry through the remaining steps. */
export async function startLogin(phoneNumber: string): Promise<{ loginId: string }> {
  pruneExpiredLoginStates();

  const { apiId, apiHash } = getApiCreds();
  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 3,
  });
  await client.connect();

  const result = await client.invoke(
    new Api.auth.SendCode({
      phoneNumber,
      apiId,
      apiHash,
      settings: new Api.CodeSettings({}),
    })
  );

  if (!(result instanceof Api.auth.SentCode)) {
    throw new Error("Unexpected response from Telegram while sending the login code.");
  }

  const loginId = crypto.randomUUID();
  getLoginStatesMap().set(loginId, {
    client,
    phoneNumber,
    phoneCodeHash: result.phoneCodeHash,
    expiresAt: Date.now() + LOGIN_STATE_TTL_MS,
  });

  return { loginId };
}

type SignInOutcome =
  | { status: "logged_in"; userId: string }
  | { status: "password_required" }
  | { status: "not_allowed"; userId: string };

/** Step 2: submit the SMS/app code for the given loginId. */
export async function submitLoginCode(loginId: string, code: string): Promise<SignInOutcome> {
  const state = getLoginStatesMap().get(loginId);
  if (!state) throw new Error("No login in progress. Request a new code first.");

  try {
    const result = await state.client.invoke(
      new Api.auth.SignIn({
        phoneNumber: state.phoneNumber,
        phoneCodeHash: state.phoneCodeHash,
        phoneCode: code,
      })
    );

    if (result instanceof Api.auth.Authorization) {
      return finishLogin(loginId, state.client, result.user as Api.User);
    }
    throw new Error("Unexpected sign-in response.");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("SESSION_PASSWORD_NEEDED")) {
      return { status: "password_required" };
    }
    throw err;
  }
}

/** Step 3 (only if 2FA is enabled): submit the cloud password for the given loginId. */
export async function submitLoginPassword(loginId: string, password: string): Promise<SignInOutcome> {
  const state = getLoginStatesMap().get(loginId);
  if (!state) throw new Error("No login in progress. Request a new code first.");

  // teleproto exposes a high-level helper for the SRP password flow. onError
  // must return true to stop the retry loop (returning normally retries).
  const { client } = state;
  let lastError: Error | undefined;
  const user = await client.signInWithPassword(
    { apiId: getApiCreds().apiId, apiHash: getApiCreds().apiHash },
    {
      password: async () => password,
      onError: async (err) => {
        lastError = err;
        return true; // stop after one attempt; caller re-prompts on failure
      },
    }
  );

  if (!user) {
    throw lastError ?? new Error("Incorrect 2FA password.");
  }

  return finishLogin(loginId, client, user as Api.User);
}

function finishLogin(loginId: string, client: TelegramClient, me: Api.User): SignInOutcome {
  const userId = me.id.toString();
  getLoginStatesMap().delete(loginId);

  if (!isTelegramUserAllowed(userId)) {
    client.destroy().catch(() => {});
    return { status: "not_allowed", userId };
  }

  const sessionString = (client.session as StringSession).save();
  persistSession(userId, sessionString, me);
  getClientsMap().set(userId, client);
  return { status: "logged_in", userId };
}

export async function logout(userId: string): Promise<void> {
  const client = await getClient(userId);
  if (client) {
    try {
      await client.invoke(new Api.auth.LogOut());
    } catch {
      // best-effort; still clear local state below
    }
    await client.destroy();
  }
  clearPersistedSession(userId);
}
