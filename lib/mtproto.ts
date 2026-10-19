import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";
import { Api } from "teleproto/tl";
import { db, sqlite } from "./db";
import { session as sessionTable } from "./db/schema";
import { decrypt, encrypt } from "./crypto";

/**
 * Singleton GramJS client stored on globalThis so it survives Next.js dev
 * hot-reloads and route-handler module re-evaluation within one process.
 */
declare global {
  var __tgDashClient: TelegramClient | undefined;
  var __tgDashLoginState: LoginState | undefined;
}

function getApiCreds() {
  const apiId = Number(process.env.API_ID);
  const apiHash = process.env.API_HASH;
  if (!apiId || !apiHash) {
    throw new Error("API_ID / API_HASH are not set. Get them from https://my.telegram.org/apps");
  }
  return { apiId, apiHash };
}

/** In-memory state for the multi-step phone -> code -> 2FA login flow. */
interface LoginState {
  client: TelegramClient;
  phoneNumber: string;
  phoneCodeHash: string;
}

export function getPersistedSession(): string | null {
  const row = db.select().from(sessionTable).limit(1).all()[0];
  if (!row) return null;
  return decrypt(row.encryptedSessionString);
}

function persistSession(sessionString: string, me: Api.User) {
  const now = new Date();
  const existing = db.select().from(sessionTable).limit(1).all()[0];
  const encrypted = encrypt(sessionString);
  const values = {
    encryptedSessionString: encrypted,
    userId: me.id.toString(),
    username: me.username ?? null,
    firstName: me.firstName ?? null,
    lastName: me.lastName ?? null,
    phone: me.phone ?? null,
    updatedAt: now,
  };
  if (existing) {
    db.update(sessionTable).set(values).run();
  } else {
    db.insert(sessionTable)
      .values({ id: 1, ...values, createdAt: now })
      .run();
  }
}

export function clearPersistedSession() {
  sqlite.prepare("DELETE FROM session").run();
  globalThis.__tgDashClient = undefined;
}

export function isLoggedIn(): boolean {
  return getPersistedSession() !== null;
}

/** Returns the connected, authorized client, or null if not logged in. */
export async function getClient(): Promise<TelegramClient | null> {
  const sessionString = getPersistedSession();
  if (!sessionString) return null;

  if (globalThis.__tgDashClient?.connected) {
    return globalThis.__tgDashClient;
  }

  const { apiId, apiHash } = getApiCreds();
  const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
    connectionRetries: 3,
  });
  await client.connect();
  globalThis.__tgDashClient = client;
  return client;
}

/** Step 1: send the login code to the given phone number. */
export async function startLogin(phoneNumber: string): Promise<{ phoneCodeHash: string }> {
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

  globalThis.__tgDashLoginState = {
    client,
    phoneNumber,
    phoneCodeHash: result.phoneCodeHash,
  };

  return { phoneCodeHash: result.phoneCodeHash };
}

type SignInOutcome =
  | { status: "logged_in" }
  | { status: "password_required" };

/** Step 2: submit the SMS/app code. */
export async function submitLoginCode(code: string): Promise<SignInOutcome> {
  const state = globalThis.__tgDashLoginState;
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
      finishLogin(state.client, result.user as Api.User);
      return { status: "logged_in" };
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

/** Step 3 (only if 2FA is enabled): submit the cloud password. */
export async function submitLoginPassword(password: string): Promise<void> {
  const state = globalThis.__tgDashLoginState;
  if (!state) throw new Error("No login in progress. Request a new code first.");

  // GramJS exposes a high-level helper for the SRP password flow. onError
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

  finishLogin(client, user as Api.User);
}

function finishLogin(client: TelegramClient, me: Api.User) {
  const sessionString = (client.session as StringSession).save();
  persistSession(sessionString, me);
  globalThis.__tgDashClient = client;
  globalThis.__tgDashLoginState = undefined;
}

export async function logout(): Promise<void> {
  const client = await getClient();
  if (client) {
    try {
      await client.invoke(new Api.auth.LogOut());
    } catch {
      // best-effort; still clear local state below
    }
    await client.destroy();
  }
  clearPersistedSession();
}
