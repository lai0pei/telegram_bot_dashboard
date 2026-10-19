import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";
import { Api } from "teleproto/tl";
import { decrypt } from "./crypto";
import { isTelegramUserAllowed } from "./auth";
import {
  getTelegramAccountById,
  isTelegramAccountLinkedToAnotherUser,
  upsertTelegramAccount,
  deleteTelegramAccount,
} from "./telegram-accounts";

/**
 * Per-account state stored on globalThis so it survives Next.js dev
 * hot-reloads and route-handler module re-evaluation within one process.
 * Clients are keyed by Telegram user ID (globally unique, so this stays
 * correct even though callers elsewhere identify an account by its
 * telegram_accounts.id — see getClient). Login states are keyed by a random
 * login ID (held in a short-lived cookie, see /api/auth/send-code) so two
 * people binding an account at once never clobber each other.
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
  /** The dashboard user binding this Telegram account, checked again at each step. */
  ownerUserId: string;
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

export function getPersistedSession(accountId: string): string | null {
  const row = getTelegramAccountById(accountId);
  if (!row) return null;
  return decrypt(row.encryptedSessionString);
}

export function clearPersistedSession(accountId: string): void {
  const row = getTelegramAccountById(accountId);
  if (!row) return;
  deleteTelegramAccount(accountId);
  const clients = getClientsMap();
  clients.get(row.telegramId)?.destroy().catch(() => {});
  clients.delete(row.telegramId);
}

export function isLoggedIn(accountId: string): boolean {
  return getPersistedSession(accountId) !== null;
}

/** Returns the connected, authorized client for this Telegram account, or null if not bound. */
export async function getClient(accountId: string): Promise<TelegramClient | null> {
  const row = getTelegramAccountById(accountId);
  if (!row) return null;
  const sessionString = decrypt(row.encryptedSessionString);

  const clients = getClientsMap();
  const existing = clients.get(row.telegramId);
  if (existing?.connected) {
    return existing;
  }

  const { apiId, apiHash } = getApiCreds();
  const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
    connectionRetries: 3,
  });
  await client.connect();
  clients.set(row.telegramId, client);
  return client;
}

/** Step 1: send the login code to the given phone number. Returns a loginId to carry through the remaining steps. */
export async function startLogin(phoneNumber: string, ownerUserId: string): Promise<{ loginId: string }> {
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
    ownerUserId,
  });

  return { loginId };
}

type SignInOutcome =
  | { status: "logged_in"; accountId: string; telegramId: string }
  | { status: "password_required" }
  | { status: "not_allowed"; telegramId: string }
  | { status: "already_linked"; telegramId: string };

function requireOwnedState(loginId: string, ownerUserId: string): LoginState {
  const state = getLoginStatesMap().get(loginId);
  if (!state) throw new Error("No login in progress. Request a new code first.");
  if (state.ownerUserId !== ownerUserId) {
    throw new Error("This login was started by a different session. Request a new code first.");
  }
  return state;
}

/** Step 2: submit the SMS/app code for the given loginId. */
export async function submitLoginCode(loginId: string, code: string, ownerUserId: string): Promise<SignInOutcome> {
  const state = requireOwnedState(loginId, ownerUserId);

  try {
    const result = await state.client.invoke(
      new Api.auth.SignIn({
        phoneNumber: state.phoneNumber,
        phoneCodeHash: state.phoneCodeHash,
        phoneCode: code,
      })
    );

    if (result instanceof Api.auth.Authorization) {
      return finishLogin(loginId, state.client, result.user as Api.User, ownerUserId);
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
export async function submitLoginPassword(
  loginId: string,
  password: string,
  ownerUserId: string
): Promise<SignInOutcome> {
  const state = requireOwnedState(loginId, ownerUserId);

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

  return finishLogin(loginId, client, user as Api.User, ownerUserId);
}

function finishLogin(
  loginId: string,
  client: TelegramClient,
  me: Api.User,
  ownerUserId: string
): SignInOutcome {
  const telegramId = me.id.toString();
  getLoginStatesMap().delete(loginId);

  if (!isTelegramUserAllowed(telegramId)) {
    client.destroy().catch(() => {});
    return { status: "not_allowed", telegramId };
  }

  if (isTelegramAccountLinkedToAnotherUser(telegramId, ownerUserId)) {
    client.destroy().catch(() => {});
    return { status: "already_linked", telegramId };
  }

  const sessionString = (client.session as StringSession).save();
  const accountId = upsertTelegramAccount({ ownerUserId, telegramId, sessionString, me });
  getClientsMap().set(telegramId, client);
  return { status: "logged_in", accountId, telegramId };
}

/** Ends the Telegram session for this account (best-effort) and removes the local row. */
export async function logout(accountId: string): Promise<void> {
  const client = await getClient(accountId);
  if (client) {
    try {
      await client.invoke(new Api.auth.LogOut());
    } catch {
      // best-effort; still clear local state below
    }
    await client.destroy();
  }
  clearPersistedSession(accountId);
}
