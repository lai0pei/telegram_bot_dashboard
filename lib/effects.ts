import { Api } from "teleproto/tl";
import { getClient } from "./mtproto";
import { singleFlight } from "./single-flight";

/** An animation Telegram can play behind a message in a private chat (🎉, 🔥, 👍 …). */
export interface MessageEffect {
  /** Sent to the Bot API as `message_effect_id`. A string because Telegram IDs exceed Number's safe range. */
  id: string;
  emoji: string;
  premiumRequired: boolean;
}

declare global {
  var __tgDashEffects: Map<string, { at: number; effects: MessageEffect[] }> | undefined;
}

const TTL_MS = 60 * 60 * 1000;

/**
 * The effects Telegram currently offers, read over MTProto with the given linked account and cached for an hour
 * per account. The Bot API has no way to list them, and the IDs aren't documented, so they're never hard-coded.
 * Returns an empty list when Telegram can't be reached (and doesn't cache that, so the next call retries).
 */
export async function getMessageEffects(accountId: string): Promise<MessageEffect[]> {
  const cache = (globalThis.__tgDashEffects ??= new Map());
  const hit = cache.get(accountId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.effects;

  return singleFlight(`effects:${accountId}`, async () => {
    try {
      const client = await getClient(accountId);
      if (!client) return [];
      const result = await client.invoke(new Api.messages.GetAvailableEffects({ hash: 0 }));
      if (!(result instanceof Api.messages.AvailableEffects)) return [];
      const effects = result.effects.map((e) => ({ id: e.id.toString(), emoji: e.emoticon, premiumRequired: Boolean(e.premiumRequired) }));
      cache.set(accountId, { at: Date.now(), effects });
      return effects;
    } catch (err) {
      console.error("[effects] messages.getAvailableEffects failed:", err instanceof Error ? err.message : err);
      return [];
    }
  });
}
