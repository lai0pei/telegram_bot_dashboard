import { NextResponse } from "next/server";

/**
 * Bots added by pasting their token (`bots.source = "token"`). Db-free so `api-guard` can map these errors without
 * pulling in the MTProto/BotFather code in `lib/bots.ts`.
 */

/** A token-added bot's token is missing or was rejected; only a new token from its owner fixes it. Routes answer 422, never 401/409. */
export class TokenBotTokenError extends Error {}

/** This bot is already managed in this dashboard (one account per bot, enforced by `bots_telegram_id_unique`). */
export class BotHeldByAnotherAccountError extends Error {
  constructor(public username: string, sameAccount = false) {
    super(sameAccount ? `@${username} is already in your dashboard.` : `@${username} is already managed by another account in this dashboard.`);
  }
}

/**
 * For routes that need the owner's Telegram session or a BotFather chat (photo upload, usernames, token reveal /
 * revoke, transfer, BotFather settings, games and Mini Apps): a 422 response for a token-added bot, else null.
 * 422, not 401/409: the client treats 401 as a dead dashboard session and 409 is reserved for account problems.
 */
export function ownedBotOnly(bot: { source: string }): NextResponse | null {
  return bot.source === "token"
    ? NextResponse.json({ error: "Only available for bots you own. This bot was added with its token." }, { status: 422 })
    : null;
}
