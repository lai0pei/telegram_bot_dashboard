import { and, eq, isNotNull } from "drizzle-orm";
import { Api } from "teleproto/tl";
import { db } from "./db";
import { bots, chats } from "./db/schema";
import { getClient } from "./mtproto";
import { singleFlight } from "./single-flight";

/** One counted resource against a Telegram limit. `limit` is null when Telegram has no per-account cap for it. */
export interface LimitItem {
  key: "bots" | "channels" | "groups" | "publicLinks";
  label: string;
  used: number;
  limit: number | null;
  /** The limit came from Telegram's own app config (true) or is a built-in fallback that may be out of date. */
  exact: boolean;
  hint: string;
}

export interface AccountLimits {
  premium: boolean;
  items: LimitItem[];
}

/** Fallbacks used only when Telegram's app config doesn't carry the number. */
const FALLBACK = {
  channelsDefault: 500,
  channelsPremium: 1000,
  publicDefault: 10,
  publicPremium: 20,
  // BotFather enforces a per-account bot cap but doesn't expose it through the API.
  bots: 20,
};

interface Limits {
  premium: boolean;
  channels: { value: number; exact: boolean };
  publicLinks: { value: number; exact: boolean };
}

declare global {
  var __tgDashLimits: Map<string, { at: number; limits: Limits }> | undefined;
}

const TTL_MS = 60 * 60 * 1000;

function readNumber(config: Api.TypeJSONValue, key: string): number | null {
  if (!(config instanceof Api.JsonObject)) return null;
  const entry = config.value.find((v) => v.key === key);
  return entry && entry.value instanceof Api.JsonNumber ? entry.value.value : null;
}

/** The account's limits from Telegram (premium flag + app config), cached for an hour per account. */
function fetchLimits(accountId: string): Promise<Limits> {
  const cache = (globalThis.__tgDashLimits ??= new Map());
  const hit = cache.get(accountId);
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.limits);

  return singleFlight(`limits:${accountId}`, async () => {
    const client = await getClient(accountId);
    if (!client) throw new Error("Not logged in to Telegram.");
    const me = await client.getMe();
    const premium = me instanceof Api.User && Boolean(me.premium);

    let config: Api.TypeJSONValue | null = null;
    try {
      const result = await client.invoke(new Api.help.GetAppConfig({ hash: 0 }));
      if (result instanceof Api.help.AppConfig) config = result.config;
    } catch (err) {
      console.error("[limits] help.getAppConfig failed, using fallbacks:", err);
    }

    const pick = (defaultKey: string, premiumKey: string, fallbackDefault: number, fallbackPremium: number) => {
      const fromTelegram = config ? readNumber(config, premium ? premiumKey : defaultKey) : null;
      return fromTelegram !== null
        ? { value: fromTelegram, exact: true }
        : { value: premium ? fallbackPremium : fallbackDefault, exact: false };
    };

    const limits: Limits = {
      premium,
      channels: pick("channels_limit_default", "channels_limit_premium", FALLBACK.channelsDefault, FALLBACK.channelsPremium),
      publicLinks: pick(
        "channels_public_limit_default",
        "channels_public_limit_premium",
        FALLBACK.publicDefault,
        FALLBACK.publicPremium
      ),
    };
    cache.set(accountId, { at: Date.now(), limits });
    return limits;
  });
}

/** Counts come from the local mirror (as of the last sync); the limits come from Telegram. */
export async function getAccountLimits(accountId: string): Promise<AccountLimits> {
  const limits = await fetchLimits(accountId);

  const botCount = (await db.select({ id: bots.id }).from(bots).where(eq(bots.ownerUserId, accountId))).length;
  const rows = await db
    .select({ kind: chats.kind })
    .from(chats)
    .where(eq(chats.ownerUserId, accountId));
  const publicCount = (await db
    .select({ id: chats.id })
    .from(chats)
    .where(and(eq(chats.ownerUserId, accountId), eq(chats.isCreator, true), isNotNull(chats.username)))).length;

  return {
    premium: limits.premium,
    items: [
      {
        key: "bots",
        label: "Bots",
        used: botCount,
        limit: FALLBACK.bots,
        exact: false,
        hint: "BotFather caps how many bots one account can create; Telegram doesn't expose the number, so this is the usual cap.",
      },
      {
        key: "channels",
        label: "Channels & supergroups",
        used: rows.filter((r) => r.kind !== "group").length,
        limit: limits.channels.value,
        exact: limits.channels.exact,
        hint: "Those you own or admin. They count toward the most channels and supergroups your account can be in.",
      },
      {
        key: "groups",
        label: "Basic groups",
        used: rows.filter((r) => r.kind === "group").length,
        limit: null,
        exact: true,
        hint: "Those you own or admin. Telegram sets no per-account cap on basic groups (each holds up to 200 members).",
      },
      {
        key: "publicLinks",
        label: "Public links",
        used: publicCount,
        limit: limits.publicLinks.value,
        exact: limits.publicLinks.exact,
        hint: "Channels/groups you created that have a public @username. Make one private to free a slot.",
      },
    ],
  };
}
