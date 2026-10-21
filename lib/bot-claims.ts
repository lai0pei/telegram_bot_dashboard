import { and, eq, isNotNull } from "drizzle-orm";
import { botNotSuspended } from "./suspension";
import { db } from "./db";
import { bots } from "./db/schema";
import { setMonitorEnabled, type BotRow } from "./bots";
import { logError } from "./error-log";
import { getInstanceId, getInstanceName } from "./instance";
import { getClient } from "./mtproto";
import { singleFlight } from "./single-flight";
import { TelegramSessionRevokedError } from "./telegram-accounts";

/**
 * Which dashboard runs a bot. Two dashboards with their own databases can be signed in with the same Telegram
 * account and then list the same bots; if both monitor one, they take turns winning getUpdates and each misses
 * messages. Telegram can't say who else is polling, but both dashboards can read the linked account, so each keeps
 * one message in its Saved Messages saying which bots it runs ("claims"). Nobody edits another dashboard's message,
 * so there is no write race. Among live claims the newest `since` wins; the loser stays on standby.
 *
 * Everything here is best-effort: when the account's session is unavailable the claims are unknown, the bot is
 * treated as unclaimed and the 409 handling in the poller still applies.
 */
const MARKER = "#tgdashclaims";
/** A claim whose heartbeat is older than this is ignored, so a dashboard that went away doesn't hold bots forever. */
const LIVE_MS = 2 * 60 * 60 * 1000;
export const CLAIM_HEARTBEAT_MS = 30 * 60 * 1000;
const READ_CACHE_MS = 60_000;
const MAX_CLAIM_MESSAGES = 50;

interface Claim {
  instance: string;
  name: string;
  /** Bot Telegram ID → when this dashboard took the bot (ms). */
  bots: Record<string, number>;
  at: number;
  messageId: number;
}

export type ClaimHolder = { kind: "none" } | { kind: "self" } | { kind: "other"; name: string; since: number };

/** Thrown when enabling monitoring for a bot another live dashboard runs, unless the caller chose to take it over. */
export class BotRunElsewhereError extends Error {
  constructor(
    public holderName: string,
    public since: number
  ) {
    super(`This bot is already run by the dashboard "${holderName}". Turn it off there, or take it over.`);
  }
}

/** Telegram calls give up after this long: an unreachable account must read as "unknown", never stall a request or the jobs loop. */
const TELEGRAM_TIMEOUT_MS = 8_000;
/** How long an unreadable account is left alone before trying again (the poller asks every round). */
const FAILURE_CACHE_MS = 30_000;

declare global {
  /** `claims: null` remembers a failed read for FAILURE_CACHE_MS. */
  var __tgDashClaimReads: Map<string, { at: number; claims: Claim[] | null }> | undefined;
  var __tgDashClaimPublishedAt: Map<string, number> | undefined;
  /** Message ID of this dashboard's claim per account, a hint for when the search doesn't list it yet. */
  var __tgDashClaimMessageIds: Map<string, number> | undefined;
}

const reads = () => (globalThis.__tgDashClaimReads ??= new Map());
const publishedAt = () => (globalThis.__tgDashClaimPublishedAt ??= new Map());
const messageIds = () => (globalThis.__tgDashClaimMessageIds ??= new Map());

function withTimeout<T>(promise: Promise<T>, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out`)), TELEGRAM_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const isMessageGone = (err: unknown) => /MESSAGE_ID_INVALID|MESSAGE_NOT_FOUND/.test(String((err as { errorMessage?: string })?.errorMessage ?? err));
const isNotModified = (err: unknown) => /MESSAGE_NOT_MODIFIED/.test(String((err as { errorMessage?: string })?.errorMessage ?? err));

function parseClaim(text: string, messageId: number): Claim | null {
  const match = /\{.*\}/s.exec(text);
  if (!text.includes(MARKER) || !match) return null;
  try {
    const raw: unknown = JSON.parse(match[0]);
    if (!raw || typeof raw !== "object") return null;
    const c = raw as Record<string, unknown>;
    if (c.v !== 1 || typeof c.instance !== "string" || typeof c.name !== "string" || typeof c.at !== "number") return null;
    if (!c.bots || typeof c.bots !== "object") return null;
    const botMap: Record<string, number> = {};
    for (const [id, since] of Object.entries(c.bots as Record<string, unknown>)) if (typeof since === "number") botMap[id] = since;
    return { instance: c.instance, name: c.name, bots: botMap, at: c.at, messageId };
  } catch {
    return null;
  }
}

/** All claim messages in the account's Saved Messages, or null when the account can't be reached. */
async function fetchClaims(accountId: string): Promise<Claim[] | null> {
  try {
    return await withTimeout(
      (async () => {
        const client = await getClient(accountId);
        if (!client) return null;
        const messages = await client.getMessages("me", { search: MARKER, limit: MAX_CLAIM_MESSAGES });
        return messages.flatMap((m) => {
          const claim = parseClaim(m.message ?? "", m.id);
          return claim ? [claim] : [];
        });
      })(),
      "reading claims"
    );
  } catch (err) {
    if (!(err instanceof TelegramSessionRevokedError)) logError("claims", "couldn't read claims", err, { accountId });
    return null;
  }
}

async function readClaims(accountId: string, fresh = false): Promise<Claim[] | null> {
  const cached = reads().get(accountId);
  if (!fresh && cached && Date.now() - cached.at < (cached.claims ? READ_CACHE_MS : FAILURE_CACHE_MS)) return cached.claims;
  const claims = await singleFlight(`claims-read:${accountId}`, () => fetchClaims(accountId));
  reads().set(accountId, { at: Date.now(), claims });
  return claims;
}

function liveHolders(claims: Claim[], botTelegramId: string, now: number): Claim[] {
  return claims.filter((c) => now - c.at < LIVE_MS && c.bots[botTelegramId] !== undefined);
}

function newest(holders: Claim[], botTelegramId: string): Claim {
  return holders.reduce((a, b) => (b.bots[botTelegramId]! > a.bots[botTelegramId]! ? b : a));
}

/** Who runs this bot according to the account's claims. An unreadable account counts as "none" (nothing known). */
export async function claimHolder(bot: Pick<BotRow, "ownerUserId" | "telegramId">, fresh = false): Promise<ClaimHolder> {
  const claims = await readClaims(bot.ownerUserId, fresh);
  if (!claims) return { kind: "none" };
  const holders = liveHolders(claims, bot.telegramId, Date.now());
  if (holders.length === 0) return { kind: "none" };
  const winner = newest(holders, bot.telegramId);
  if (winner.instance === (await getInstanceId())) return { kind: "self" };
  return { kind: "other", name: winner.name, since: winner.bots[bot.telegramId]! };
}

/**
 * Rewrites this dashboard's claim message for one Telegram account from its monitored bots, and updates
 * `bots.run_elsewhere` for them. A bot another live dashboard claimed later is left out (we're on standby) unless
 * it is in `takeOver`, which stamps it with the current time so it beats the other claim. Never throws.
 */
export async function publishClaims(accountId: string, takeOver: ReadonlySet<string> = new Set()): Promise<void> {
  try {
    await singleFlight(`claims-publish:${accountId}`, () => publish(accountId, takeOver));
  } catch (err) {
    logError("claims", "couldn't publish claims", err, { accountId });
  }
}

async function publish(accountId: string, takeOver: ReadonlySet<string>): Promise<void> {
  const claims = await readClaims(accountId, true);
  if (!claims) return;
  const self = await getInstanceId();
  const now = Date.now();
  // Normally one message; more than one means an earlier write left a duplicate. Keep the newest and remove the rest.
  const ownMessages = claims.filter((c) => c.instance === self).sort((a, b) => b.messageId - a.messageId);
  const mine = ownMessages[0];
  const monitored = await db
    .select()
    .from(bots)
    .where(and(eq(bots.ownerUserId, accountId), eq(bots.monitorEnabled, true), isNotNull(bots.encryptedToken), botNotSuspended(bots.id)));

  const claimed: Record<string, number> = {};
  for (const bot of monitored) {
    const others = liveHolders(claims, bot.telegramId, now).filter((c) => c.instance !== self);
    const otherSince = others.length ? newest(others, bot.telegramId).bots[bot.telegramId]! : undefined;
    const prior = mine?.bots[bot.telegramId];
    let runElsewhere: string | null = null;
    // A take-over must win whatever the two machines' clocks say, so it is stamped just after the claim it replaces.
    if (takeOver.has(bot.telegramId)) claimed[bot.telegramId] = Math.max(now, (otherSince ?? 0) + 1);
    else if (prior === undefined && otherSince === undefined) claimed[bot.telegramId] = now;
    else if (prior !== undefined && (otherSince === undefined || prior >= otherSince)) claimed[bot.telegramId] = prior;
    else runElsewhere = newest(others, bot.telegramId).name;
    if (bot.runElsewhere !== runElsewhere) await db.update(bots).set({ runElsewhere }).where(eq(bots.id, bot.id));
  }

  // The search can lag behind a message we just sent, so the ID remembered from our last write counts too.
  const target = mine?.messageId ?? messageIds().get(accountId);
  // Nothing to say and nothing said before: don't create a message just to leave it empty.
  if (target === undefined && Object.keys(claimed).length === 0) return;

  const name = getInstanceName();
  const payload = JSON.stringify({ v: 1, instance: self, name, bots: claimed, at: now });
  const count = Object.keys(claimed).length;
  const text =
    `🤖 Bot dashboard "${name}" runs ${count} bot${count === 1 ? "" : "s"} for this account. ` +
    `Updated automatically; deleting this message only makes the dashboard forget it. ${MARKER}\n${payload}`;

  await withTimeout(write(accountId, target, text, ownMessages.slice(1).map((c) => c.messageId)), "writing the claim");
  publishedAt().set(accountId, now);
  reads().delete(accountId);
}

/**
 * Edits our claim message, or sends a new one only when it is really gone (deleted by hand). Any other failure
 * (flood wait, network) is rethrown: falling back to a send there would leave two live messages from us.
 */
async function write(accountId: string, target: number | undefined, text: string, duplicates: number[]): Promise<void> {
  const client = await getClient(accountId);
  if (!client) return;
  // parseMode false = send as typed (the client's default would read the JSON and the hashtag as Markdown).
  let id = target;
  if (id !== undefined) {
    try {
      await client.editMessage("me", { message: id, text, parseMode: false });
    } catch (err) {
      if (isMessageGone(err)) id = undefined;
      else if (!isNotModified(err)) throw err;
    }
  }
  if (id === undefined) id = (await client.sendMessage("me", { message: text, parseMode: false })).id;
  messageIds().set(accountId, id);
  if (duplicates.length) await client.deleteMessages("me", duplicates, { revoke: true }).catch(() => {});
}

export async function setRunElsewhere(botId: number, name: string | null): Promise<void> {
  await db.update(bots).set({ runElsewhere: name }).where(eq(bots.id, botId));
}

/** Publishes unless this account was published in the last minute (used from the poller, which loops every few seconds). */
export async function ensureClaimed(accountId: string): Promise<void> {
  if (Date.now() - (publishedAt().get(accountId) ?? 0) < READ_CACHE_MS) return;
  publishedAt().set(accountId, Date.now());
  await publishClaims(accountId);
}

/** Heartbeat for the jobs loop: refreshes the claim of every account that has monitored bots. */
export async function publishAllClaims(): Promise<void> {
  const accounts = await db
    .selectDistinct({ id: bots.ownerUserId })
    .from(bots)
    .where(and(eq(bots.monitorEnabled, true), isNotNull(bots.encryptedToken), botNotSuspended(bots.id)));
  for (const { id } of accounts) await publishClaims(id);
}

/**
 * Turns monitoring on. Throws BotRunElsewhereError when another live dashboard runs the bot and `takeOver` is false.
 * Callers check the webhook first (monitoring and a webhook exclude each other).
 */
export async function enableMonitoring(bot: Pick<BotRow, "id" | "ownerUserId" | "telegramId">, takeOver = false): Promise<void> {
  // A fresh read: the cached one may be up to a minute old, which is exactly when another dashboard just claimed it.
  const holder = await claimHolder(bot, true);
  if (holder.kind === "other" && !takeOver) throw new BotRunElsewhereError(holder.name, holder.since);
  await setMonitorEnabled(bot.id, true);
  if (takeOver) await setRunElsewhere(bot.id, null);
  await publishClaims(bot.ownerUserId, takeOver ? new Set([bot.telegramId]) : undefined);
}

export async function disableMonitoring(bot: Pick<BotRow, "id" | "ownerUserId">): Promise<void> {
  await setMonitorEnabled(bot.id, false);
  await db.update(bots).set({ runElsewhere: null }).where(eq(bots.id, bot.id));
  await publishClaims(bot.ownerUserId);
}
