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

declare global {
  var __tgDashClaimReads: Map<string, { at: number; claims: Claim[] }> | undefined;
  var __tgDashClaimPublishedAt: Map<string, number> | undefined;
}

const reads = () => (globalThis.__tgDashClaimReads ??= new Map());
const publishedAt = () => (globalThis.__tgDashClaimPublishedAt ??= new Map());

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
    const client = await getClient(accountId);
    if (!client) return null;
    const messages = await client.getMessages("me", { search: MARKER, limit: MAX_CLAIM_MESSAGES });
    return messages.flatMap((m) => {
      const claim = parseClaim(m.message ?? "", m.id);
      return claim ? [claim] : [];
    });
  } catch (err) {
    if (!(err instanceof TelegramSessionRevokedError)) logError("claims", "couldn't read claims", err, { accountId });
    return null;
  }
}

async function readClaims(accountId: string, fresh = false): Promise<Claim[] | null> {
  const cached = reads().get(accountId);
  if (!fresh && cached && Date.now() - cached.at < READ_CACHE_MS) return cached.claims;
  const claims = await singleFlight(`claims-read:${accountId}`, () => fetchClaims(accountId));
  if (claims) reads().set(accountId, { at: Date.now(), claims });
  return claims;
}

function liveHolders(claims: Claim[], botTelegramId: string, now: number): Claim[] {
  return claims.filter((c) => now - c.at < LIVE_MS && c.bots[botTelegramId] !== undefined);
}

function newest(holders: Claim[], botTelegramId: string): Claim {
  return holders.reduce((a, b) => (b.bots[botTelegramId]! > a.bots[botTelegramId]! ? b : a));
}

/** Who runs this bot according to the account's claims. An unreadable account counts as "none" (nothing known). */
export async function claimHolder(bot: Pick<BotRow, "ownerUserId" | "telegramId">): Promise<ClaimHolder> {
  const claims = await readClaims(bot.ownerUserId);
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
  const mine = claims.find((c) => c.instance === self);
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
    if (takeOver.has(bot.telegramId) || (prior === undefined && otherSince === undefined)) claimed[bot.telegramId] = now;
    else if (prior !== undefined && (otherSince === undefined || prior >= otherSince)) claimed[bot.telegramId] = prior;
    else runElsewhere = newest(others, bot.telegramId).name;
    if (bot.runElsewhere !== runElsewhere) await db.update(bots).set({ runElsewhere }).where(eq(bots.id, bot.id));
  }

  // Nothing to say and nothing said before: don't create a message just to leave it empty.
  if (!mine && Object.keys(claimed).length === 0) return;

  const name = getInstanceName();
  const payload = JSON.stringify({ v: 1, instance: self, name, bots: claimed, at: now });
  const count = Object.keys(claimed).length;
  const text =
    `🤖 Bot dashboard "${name}" runs ${count} bot${count === 1 ? "" : "s"} for this account. ` +
    `Updated automatically; deleting this message only makes the dashboard forget it. ${MARKER}\n${payload}`;

  const client = await getClient(accountId);
  if (!client) return;
  // parseMode false = send as typed (the client's default would read the JSON and the hashtag as Markdown).
  if (mine) {
    try {
      await client.editMessage("me", { message: mine.messageId, text, parseMode: false });
    } catch {
      // The message was deleted by hand (or can no longer be edited): write a fresh one.
      await client.sendMessage("me", { message: text, parseMode: false });
    }
  } else {
    await client.sendMessage("me", { message: text, parseMode: false });
  }
  publishedAt().set(accountId, now);
  reads().delete(accountId);
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
  const holder = await claimHolder(bot);
  if (holder.kind === "other" && !takeOver) throw new BotRunElsewhereError(holder.name, holder.since);
  await setMonitorEnabled(bot.id, true);
  await publishClaims(bot.ownerUserId, takeOver ? new Set([bot.telegramId]) : undefined);
}

export async function disableMonitoring(bot: Pick<BotRow, "id" | "ownerUserId">): Promise<void> {
  await setMonitorEnabled(bot.id, false);
  await db.update(bots).set({ runElsewhere: null }).where(eq(bots.id, bot.id));
  await publishClaims(bot.ownerUserId);
}
