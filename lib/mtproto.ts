import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";
import { Api } from "teleproto/tl";
import { Raw } from "teleproto/events";
import { RPCError } from "teleproto/errors";
import { decrypt } from "./crypto";
import { isRegistrationOpenFor, isTelegramUserAllowed } from "./app-settings";
import { singleFlight } from "./single-flight";
import {
  getTelegramAccountById,
  getTelegramAccountByTelegramId,
  isTelegramAccountLinkedToAnotherUser,
  upsertTelegramAccount,
  deleteTelegramAccount,
  markTelegramAccountRevoked,
  TelegramSessionRevokedError,
  type TelegramAccountRow,
} from "./telegram-accounts";
import { createUserForTelegram, getUserById } from "./users";

/**
 * Per-account state stored on globalThis so it survives Next.js dev
 * hot-reloads and route-handler module re-evaluation within one process.
 * Clients are keyed by Telegram user ID (globally unique, so this stays
 * correct even though callers elsewhere identify an account by its
 * telegram_accounts.id — see getClient). Login states are keyed by a random
 * login ID (held in a short-lived cookie, see /api/auth/qr) so two
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
/** Hard ceiling on concurrent pending logins — sign-in mode is reachable by anyone, not just existing dashboard users. */
const MAX_PENDING_LOGINS = 100;

/** In-memory state for one browser's QR-scan login flow, then optional 2FA. */
interface LoginState {
  client: TelegramClient;
  expiresAt: number;
  /**
   * "link": binding an extra Telegram account to an already-signed-in
   * dashboard user (ownerUserId is that user). "signin": the dashboard's own
   * login — the owner is whichever dashboard user the scanned Telegram
   * account resolves to (existing owner, or a freshly created one),
   * determined in finishLogin, so ownerUserId is unset until then.
   */
  mode: "link" | "signin";
  ownerUserId?: string;
  qr: QrLogin;
}

interface QrLogin {
  token: Buffer;
  tokenExpiresAt: number;
  /** Set once the scan resolves (success, 2FA needed, or a rejection) — reported by the next poll. */
  outcome?: SignInOutcome;
  error?: string;
  /** Collapses the scan-update handler and an expiry refresh racing on the same export call. */
  inFlight?: Promise<void>;
  stopListening: () => void;
}

function pruneExpiredLoginStates() {
  const states = getLoginStatesMap();
  const now = Date.now();
  for (const [id, state] of states) {
    if (state.expiresAt < now) {
      state.qr.stopListening();
      state.client.destroy().catch(() => {});
      states.delete(id);
    }
  }
}

export async function clearPersistedSession(accountId: string): Promise<void> {
  const row = await getTelegramAccountById(accountId);
  if (!row) return;
  await deleteTelegramAccount(accountId);
  const clients = getClientsMap();
  clients.get(row.telegramId)?.destroy().catch(() => {});
  clients.delete(row.telegramId);
}

export async function isLoggedIn(accountId: string): Promise<boolean> {
  const row = await getTelegramAccountById(accountId);
  return !!row && !row.revokedAt;
}

/**
 * A 401 means Telegram no longer recognizes this authorization — terminated
 * from the phone's Devices list, "terminate all other sessions", or the
 * account was deleted/banned. SESSION_PASSWORD_NEEDED is also a 401 but only
 * occurs mid-login, never on an established session.
 */
function isRevokedSessionError(err: unknown): boolean {
  return err instanceof RPCError && err.code === 401 && err.errorMessage !== "SESSION_PASSWORD_NEEDED";
}

async function handleRevokedSession(accountId: string, telegramId: string, client: TelegramClient): Promise<void> {
  const clients = getClientsMap();
  const current = clients.get(telegramId);
  // Only the account's current connection speaks for it. An old one replaced
  // by a newer sign-in (see endPreviousSession) failing late must not mark
  // the fresh session revoked.
  if (!current || current === client) {
    await markTelegramAccountRevoked(accountId);
    clients.delete(telegramId);
  }
  client.destroy().catch(() => {});
}

/**
 * Every MTProto call (high-level helpers like getDialogs included) goes
 * through client.invoke, so wrapping it here catches a revoked session no
 * matter which feature hits it first. Once one call sees the revocation the
 * client is destroyed, so calls already in flight on it fail with generic
 * disconnect errors and new ones can't run — both are reported as
 * TelegramSessionRevokedError too, so parallel requests (the overview loads
 * account, bots and chats at once) all get SESSION_REVOKED, not a stray
 * "disconnected" error.
 */
function watchForRevocation(client: TelegramClient, accountId: string, telegramId: string): void {
  const invoke = client.invoke.bind(client);
  let revoked = false;
  client.invoke = (async (request: Parameters<typeof invoke>[0], ...rest: unknown[]) => {
    if (revoked) throw new TelegramSessionRevokedError();
    try {
      return await (invoke as (...args: unknown[]) => Promise<unknown>)(request, ...rest);
    } catch (err) {
      if (revoked) throw new TelegramSessionRevokedError();
      if (isRevokedSessionError(err)) {
        revoked = true;
        await handleRevokedSession(accountId, telegramId, client);
        throw new TelegramSessionRevokedError();
      }
      throw err;
    }
  }) as typeof client.invoke;
}

/**
 * Returns the connected, authorized client for this Telegram account, or null
 * if not bound. Throws TelegramSessionRevokedError if its session has ended.
 */
export async function getClient(accountId: string): Promise<TelegramClient | null> {
  const row = await getTelegramAccountById(accountId);
  if (!row) return null;
  if (row.revokedAt) throw new TelegramSessionRevokedError();
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
  watchForRevocation(client, row.id, row.telegramId);
  try {
    await client.connect();
  } catch (err) {
    if (isRevokedSessionError(err)) {
      await handleRevokedSession(row.id, row.telegramId, client);
      throw new TelegramSessionRevokedError();
    }
    throw err;
  }
  clients.set(row.telegramId, client);
  return client;
}

const SESSION_CHECK_TTL_MS = 30_000;

declare global {
  var __tgDashSessionChecks: Map<string, number> | undefined;
}

/**
 * Probes whether this account's Telegram session is still alive (a revoked
 * one gets marked via watchForRevocation). At most once per TTL per account,
 * so the account list can call it on every refresh. Network failures are
 * swallowed: an unreachable Telegram is not a revoked session.
 */
export async function checkTelegramSession(accountId: string): Promise<void> {
  const checks = (globalThis.__tgDashSessionChecks ??= new Map());
  const last = checks.get(accountId);
  if (last && Date.now() - last < SESSION_CHECK_TTL_MS) return;

  await singleFlight(`session-check:${accountId}`, async () => {
    try {
      const client = await getClient(accountId);
      await client?.invoke(new Api.updates.GetState());
    } catch {
      // Revocation is already recorded by getClient/watchForRevocation.
    } finally {
      checks.set(accountId, Date.now());
    }
  });
}

export type QrLoginStatus =
  | { status: "waiting"; qrUrl: string; expiresAt: number }
  | SignInOutcome;

/**
 * Step 1: start a QR-code login. Poll with pollQrLogin until it resolves.
 * `ownerUserId` is set for "link" (binding an extra account to the caller's
 * existing dashboard user) and omitted for "signin" (the dashboard's own
 * login, where the owner isn't known until the scan resolves).
 */
export async function startQrLogin(mode: "link" | "signin", ownerUserId?: string): Promise<{ loginId: string }> {
  pruneExpiredLoginStates();
  if (getLoginStatesMap().size >= MAX_PENDING_LOGINS) {
    throw new Error("Too many logins are in progress right now. Try again shortly.");
  }

  const { apiId, apiHash } = getApiCreds();
  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 3,
  });
  await client.connect();

  const loginId = crypto.randomUUID();
  // Telegram pushes UpdateLoginToken to this unauthorized connection the moment
  // the code is scanned; re-exporting then returns the authorization.
  const onScanned = () => {
    const state = getLoginStatesMap().get(loginId);
    if (state) runQrExport(state).catch(() => {});
  };
  const rawEvent = new Raw({ types: [Api.UpdateLoginToken] });
  client.addEventHandler(onScanned, rawEvent);

  const state: LoginState = {
    client,
    expiresAt: Date.now() + LOGIN_STATE_TTL_MS,
    mode,
    ownerUserId,
    qr: {
      token: Buffer.alloc(0),
      tokenExpiresAt: 0,
      stopListening: () => client.removeEventHandler(onScanned, rawEvent),
    },
  };
  getLoginStatesMap().set(loginId, state);

  try {
    await runQrExport(state);
    if (state.qr.error) throw new Error(state.qr.error);
  } catch (err) {
    state.qr.stopListening();
    getLoginStatesMap().delete(loginId);
    client.destroy().catch(() => {});
    throw err;
  }
  return { loginId };
}

function runQrExport(state: LoginState): Promise<void> {
  const { qr } = state;
  qr.inFlight ??= exportQrToken(state).finally(() => {
    qr.inFlight = undefined;
  });
  return qr.inFlight;
}

/**
 * auth.ExportLoginToken doubles as the status check: before a scan it mints a
 * fresh token, after a scan it returns the authorization (possibly via a DC
 * migration). Results land on state.qr rather than being thrown, since this
 * also runs from the update handler with no request to report to.
 */
async function exportQrToken(state: LoginState): Promise<void> {
  const { qr } = state;
  if (qr.outcome || qr.error) return;
  const { client, mode, ownerUserId } = state;
  const { apiId, apiHash } = getApiCreds();
  try {
    let result = await client.invoke(new Api.auth.ExportLoginToken({ apiId, apiHash, exceptIds: [] }));
    if (result instanceof Api.auth.LoginTokenMigrateTo) {
      await client._switchDC(result.dcId);
      result = await client.invoke(new Api.auth.ImportLoginToken({ token: result.token }));
    }

    if (result instanceof Api.auth.LoginToken) {
      qr.token = result.token;
      qr.tokenExpiresAt = result.expires * 1000;
      return;
    }
    if (result instanceof Api.auth.LoginTokenSuccess && result.authorization instanceof Api.auth.Authorization) {
      qr.stopListening();
      qr.outcome = await finishLogin(client, result.authorization.user as Api.User, mode, ownerUserId);
      return;
    }
    throw new Error("Unexpected response from Telegram during QR login.");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("SESSION_PASSWORD_NEEDED")) {
      qr.stopListening();
      qr.outcome = { status: "password_required" };
      return;
    }
    qr.error = message;
  }
}

/**
 * Reports the QR login's progress, minting a new code once the current one
 * expires (Telegram hands back the same token until then). A finished login is
 * removed here, except "password_required", which keeps the state for
 * submitLoginPassword.
 */
export async function pollQrLogin(
  loginId: string,
  mode: "link" | "signin",
  ownerUserId?: string
): Promise<QrLoginStatus> {
  const state = requireOwnedState(loginId, mode, ownerUserId);
  const { qr } = state;

  if (!qr.outcome && !qr.error && qr.tokenExpiresAt <= Date.now()) {
    await runQrExport(state);
  } else if (qr.inFlight) {
    await qr.inFlight;
  }

  if (qr.error) {
    getLoginStatesMap().delete(loginId);
    state.client.destroy().catch(() => {});
    throw new Error(qr.error);
  }
  if (qr.outcome) {
    if (qr.outcome.status !== "password_required") getLoginStatesMap().delete(loginId);
    return qr.outcome;
  }
  return {
    status: "waiting",
    qrUrl: `tg://login?token=${qr.token.toString("base64url")}`,
    expiresAt: qr.tokenExpiresAt,
  };
}

type SignInOutcome =
  | { status: "logged_in"; accountId: string; telegramId: string; userId: string }
  | { status: "password_required" }
  | { status: "not_allowed"; telegramId: string }
  | { status: "already_linked"; telegramId: string }
  | { status: "registration_closed"; telegramId: string }
  | { status: "suspended"; telegramId: string };

/**
 * Looks up the login state for this loginId and checks it belongs to this
 * caller. For "link" that means the same dashboard user who started it; for
 * "signin" there's no dashboard user yet, so only the mode itself is
 * checked — the cookie-held loginId is the only thing tying the request to
 * the browser that started it.
 */
function requireOwnedState(loginId: string, mode: "link" | "signin", ownerUserId?: string): LoginState {
  const state = getLoginStatesMap().get(loginId);
  if (!state) throw new Error("No login in progress. Start again.");
  if (state.mode !== mode) {
    throw new Error("This login was started differently. Start again.");
  }
  if (mode === "link" && state.ownerUserId !== ownerUserId) {
    throw new Error("This login was started by a different session. Start again.");
  }
  return state;
}

/** Step 2 (only if 2FA is enabled): submit the cloud password for the given loginId. */
export async function submitLoginPassword(
  loginId: string,
  password: string,
  mode: "link" | "signin",
  ownerUserId?: string
): Promise<SignInOutcome> {
  const state = requireOwnedState(loginId, mode, ownerUserId);

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

  getLoginStatesMap().delete(loginId);
  return finishLogin(client, user as Api.User, state.mode, state.ownerUserId);
}

async function finishLogin(
  client: TelegramClient,
  me: Api.User,
  mode: "link" | "signin",
  ownerUserId?: string
): Promise<SignInOutcome> {
  const telegramId = me.id.toString();

  if (!(await isTelegramUserAllowed(telegramId))) {
    client.destroy().catch(() => {});
    return { status: "not_allowed", telegramId };
  }

  const existing = await getTelegramAccountByTelegramId(telegramId);
  if (mode === "link") {
    if ((await isTelegramAccountLinkedToAnotherUser(telegramId, ownerUserId!))) {
      client.destroy().catch(() => {});
      return { status: "already_linked", telegramId };
    }
  } else if (existing?.ownerUserId) {
    // Checked before anything below touches the account: a suspended user's scan must not replace their stored session or end the previous one.
    if ((await getUserById(existing.ownerUserId))?.suspendedAt) {
      client.destroy().catch(() => {});
      return { status: "suspended", telegramId };
    }
    ownerUserId = existing.ownerUserId;
  } else if (!(await isRegistrationOpenFor(telegramId))) {
    client.destroy().catch(() => {});
    return { status: "registration_closed", telegramId };
  } else {
    ownerUserId = (await createUserForTelegram(me)).id;
  }

  // Keep one dashboard session per Telegram account: an existing login
  // (another browser, or the one just replaced by this scan) is signed out
  // of Telegram so its Devices list doesn't accumulate dashboard entries.
  if (existing) await endPreviousSession(existing, telegramId);

  const sessionString = (client.session as StringSession).save();
  const accountId = await upsertTelegramAccount({ ownerUserId: ownerUserId!, telegramId, sessionString, me });
  watchForRevocation(client, accountId, telegramId);
  getClientsMap().set(telegramId, client);
  globalThis.__tgDashSessionChecks?.delete(accountId);
  return { status: "logged_in", accountId, telegramId, userId: ownerUserId! };
}

/** Best-effort auth.LogOut on the session this one is replacing, using whichever copy is at hand (live client, or the stored session string). */
async function endPreviousSession(existing: TelegramAccountRow, telegramId: string): Promise<void> {
  const clients = getClientsMap();
  const live = clients.get(telegramId);
  clients.delete(telegramId);
  if (live) {
    await live.invoke(new Api.auth.LogOut()).catch(() => {});
    await live.destroy().catch(() => {});
    return;
  }
  if (existing.revokedAt) return; // nothing left to log out of
  try {
    const { apiId, apiHash } = getApiCreds();
    const client = new TelegramClient(new StringSession(decrypt(existing.encryptedSessionString)), apiId, apiHash, {
      connectionRetries: 1,
    });
    await client.connect();
    await client.invoke(new Api.auth.LogOut()).catch(() => {});
    await client.destroy();
  } catch {
    // best-effort only
  }
}

/** Ends the Telegram session for this account (best-effort) and removes the local row. */
export async function logout(accountId: string): Promise<void> {
  // A revoked session has nothing left to log out of on Telegram's side.
  const client = await getClient(accountId).catch(() => null);
  if (client) {
    try {
      await client.invoke(new Api.auth.LogOut());
    } catch {
      // best-effort; still clear local state below
    }
    await client.destroy();
  }
  await clearPersistedSession(accountId);
}
