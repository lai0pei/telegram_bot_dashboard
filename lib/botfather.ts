import { Api } from "teleproto/tl";
import type { TelegramClient } from "teleproto";
import { getClient } from "./mtproto";

const BOTFATHER = "BotFather";
const REPLY_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 500;

/**
 * Conversation engine for scripting @BotFather. All prompts/regexes BotFather
 * is expected to send live here, in one place, so they're easy to patch if
 * BotFather's wording changes. Every exported flow acquires that user's
 * mutex first, so two flows never interleave in the same user's BotFather
 * chat — but different users' flows run independently of each other.
 */
class Mutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => this.release();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.locked = true;
        resolve(() => this.release());
      });
    });
  }

  private release() {
    const next = this.queue.shift();
    if (next) next();
    else this.locked = false;
  }
}

declare global {
  var __tgDashBotFatherMutexes: Map<string, Mutex> | undefined;
}

function getMutex(userId: string): Mutex {
  const mutexes = (globalThis.__tgDashBotFatherMutexes ??= new Map());
  let mutex = mutexes.get(userId);
  if (!mutex) {
    mutex = new Mutex();
    mutexes.set(userId, mutex);
  }
  return mutex;
}

export class BotFatherError extends Error {}

/** Sends a message to BotFather and waits for its next reply after `afterId`. */
async function sendAndAwaitReply(
  client: TelegramClient,
  text: string,
  afterId: number
): Promise<Api.Message> {
  await client.sendMessage(BOTFATHER, { message: text });
  return awaitResponse(client, afterId);
}

/** A message we expect BotFather to edit in place (inline-keyboard navigation does this). */
interface EditWatch {
  messageId: number;
  signature: string;
}

/** Fingerprint of a message's visible state, so an in-place edit can be detected. */
function messageSignature(message: Api.Message): string {
  return JSON.stringify([message.editDate ?? 0, message.text ?? "", buttonLabels(message)]);
}

/**
 * Waits for BotFather to respond: either a new incoming message after
 * `afterId`, or — when `watch` is given — an edit of that message. Clicking
 * an inline button in /mybots edits the menu message rather than sending a
 * new one, so waiting only for new messages would always time out there.
 */
async function awaitResponse(client: TelegramClient, afterId: number, watch?: EditWatch): Promise<Api.Message> {
  const deadline = Date.now() + REPLY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const recent = await client.getMessages(BOTFATHER, { limit: 5 });
    const reply = recent.find((m) => m.id > afterId && !m.out);
    if (reply) return reply;

    if (watch) {
      const current =
        recent.find((m) => m.id === watch.messageId) ??
        (await client.getMessages(BOTFATHER, { ids: [watch.messageId] }))[0];
      if (current && messageSignature(current) !== watch.signature) return current;
    }

    await sleep(POLL_INTERVAL_MS);
  }
  throw new BotFatherError("Timed out waiting for a reply from @BotFather.");
}

async function getLastMessageId(client: TelegramClient): Promise<number> {
  const messages = await client.getMessages(BOTFATHER, { limit: 1 });
  return messages[0]?.id ?? 0;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withClient<T>(userId: string, fn: (client: TelegramClient) => Promise<T>): Promise<T> {
  const client = await getClient(userId);
  if (!client) throw new BotFatherError("Not logged in to Telegram.");
  const release = await getMutex(userId).acquire();
  try {
    return await fn(client);
  } finally {
    release();
  }
}

// --- Create -----------------------------------------------------------

export interface CreateBotResult {
  username: string;
  token: string;
}

export async function createBot(userId: string, name: string, username: string): Promise<CreateBotResult> {
  return withClient(userId, async (client) => {
    let lastId = await getLastMessageId(client);

    let reply = await sendAndAwaitReply(client, "/newbot", lastId);
    lastId = reply.id;
    if (!/alright.*what do you want to call/i.test(reply.text ?? "")) {
      throw new BotFatherError(`Unexpected BotFather reply to /newbot: "${reply.text}"`);
    }

    reply = await sendAndAwaitReply(client, name, lastId);
    lastId = reply.id;
    if (!/choose a username/i.test(reply.text ?? "")) {
      throw new BotFatherError(`BotFather rejected the bot name: "${reply.text}"`);
    }

    reply = await sendAndAwaitReply(client, username, lastId);
    lastId = reply.id;
    const text = reply.text ?? "";

    if (/sorry.*this username is already taken/i.test(text)) {
      throw new BotFatherError("That username is already taken.");
    }
    if (/can only contain|too short|must end in.*bot/i.test(text)) {
      throw new BotFatherError(`BotFather rejected the username: "${text}"`);
    }
    if (/too many attempts|retry later|flood/i.test(text)) {
      throw new BotFatherError("Rate limited by BotFather. Try again later.");
    }

    const tokenMatch = text.match(/(\d{6,}:[\w-]{30,})/);
    if (!/done!/i.test(text) || !tokenMatch) {
      throw new BotFatherError(`Unexpected BotFather reply while creating the bot: "${text}"`);
    }

    return { username, token: tokenMatch[1] };
  });
}

// --- Delete -------------------------------------------------------------

export async function deleteBot(userId: string, username: string): Promise<void> {
  return withClient(userId, async (client) => {
    let lastId = await getLastMessageId(client);

    let reply = await sendAndAwaitReply(client, "/deletebot", lastId);
    lastId = reply.id;
    if (!/choose a bot/i.test(reply.text ?? "")) {
      throw new BotFatherError(`Unexpected BotFather reply to /deletebot: "${reply.text}"`);
    }

    const handle = username.startsWith("@") ? username : `@${username}`;
    reply = await sendAndAwaitReply(client, handle, lastId);
    lastId = reply.id;
    if (!/are you really sure/i.test(reply.text ?? "")) {
      throw new BotFatherError(`BotFather did not ask for confirmation: "${reply.text}"`);
    }

    reply = await sendAndAwaitReply(client, "Yes, I am totally sure.", lastId);
    if (!/done! the bot.*deleted/i.test(reply.text ?? "")) {
      throw new BotFatherError(`Unexpected BotFather reply while deleting the bot: "${reply.text}"`);
    }
  });
}

// --- Fetch / revoke token ---------------------------------------------------
//
// These flows navigate BotFather's inline keyboards. Each click edits the
// same menu message in place: /mybots -> @bot -> "API Token" (shows the
// token) -> "Revoke current token" (shows a new one).

const TOKEN_PATTERN = /(\d{6,}:[\w-]{30,})/;
const MAX_BOT_LIST_PAGES = 10;

/** Sends /mybots, pages through the list until @username appears, clicks it, and returns the bot's menu. */
async function openBotMenu(client: TelegramClient, username: string): Promise<Api.Message> {
  const handle = `@${username.replace(/^@/, "")}`;
  const lastId = await getLastMessageId(client);
  let menu = await sendAndAwaitReply(client, "/mybots", lastId);

  for (let page = 0; page < MAX_BOT_LIST_PAGES; page++) {
    const botButton = findButton(menu, (label) => label.toLowerCase() === handle.toLowerCase());
    if (botButton) return clickAndAwaitResponse(client, menu, botButton);

    const nextPage = findButton(menu, (label) => label.trim() === "»" || /next/i.test(label));
    if (!nextPage) break;
    menu = await clickAndAwaitResponse(client, menu, nextPage);
  }
  throw new BotFatherError(`BotFather's /mybots list doesn't include ${handle}.`);
}

/** From a bot's menu, opens its "API Token" screen. */
async function openTokenScreen(client: TelegramClient, botMenu: Api.Message): Promise<Api.Message> {
  const tokenButton = findButton(botMenu, (label) => /api token/i.test(label));
  if (!tokenButton) {
    throw new BotFatherError("Could not find the 'API Token' button for this bot.");
  }
  return clickAndAwaitResponse(client, botMenu, tokenButton);
}

/** Retrieves a bot's token via /mybots -> <bot> -> "API Token". */
export async function fetchBotToken(userId: string, username: string): Promise<string> {
  return withClient(userId, async (client) => {
    const botMenu = await openBotMenu(client, username);
    const tokenScreen = await openTokenScreen(client, botMenu);
    const tokenMatch = (tokenScreen.text ?? "").match(TOKEN_PATTERN);
    if (!tokenMatch) {
      throw new BotFatherError(`Unexpected BotFather reply while fetching the token: "${tokenScreen.text}"`);
    }
    return tokenMatch[1];
  });
}

/** Revokes a bot's token via /mybots -> <bot> -> "API Token" -> "Revoke current token". */
export async function revokeBotToken(userId: string, username: string): Promise<string> {
  return withClient(userId, async (client) => {
    const botMenu = await openBotMenu(client, username);
    const tokenScreen = await openTokenScreen(client, botMenu);
    const oldToken = (tokenScreen.text ?? "").match(TOKEN_PATTERN)?.[1];

    const revokeButton = findButton(tokenScreen, (label) => /revoke/i.test(label));
    if (!revokeButton) {
      throw new BotFatherError("Could not find the 'Revoke current token' button for this bot.");
    }
    let reply = await clickAndAwaitResponse(client, tokenScreen, revokeButton);

    // Some BotFather versions ask for confirmation before revoking.
    const confirmButton = findButton(reply, (label) => /^(yes|revoke)/i.test(label.trim()));
    if (!TOKEN_PATTERN.test(reply.text ?? "") && confirmButton) {
      reply = await clickAndAwaitResponse(client, reply, confirmButton);
    }

    const newToken = (reply.text ?? "").match(TOKEN_PATTERN)?.[1];
    if (!newToken || newToken === oldToken) {
      throw new BotFatherError(`Unexpected BotFather reply while revoking the token: "${reply.text}"`);
    }
    return newToken;
  });
}

// --- Button helpers ---------------------------------------------------
//
// teleproto tracks a newer TL layer (230) than classic GramJS: inline
// keyboard buttons are `KeyboardInlineButton { text, type }`, where `type`
// is a union and the callback-data variant is `InlineButtonTypeCallback`.

function inlineButtons(message: Api.Message): Api.KeyboardInlineButton[] {
  const markup = message.replyMarkup;
  if (!markup || !(markup instanceof Api.ReplyInlineMarkup)) return [];
  return markup.rows.flatMap((row) => row.buttons);
}

function buttonLabels(message: Api.Message): string[] {
  return inlineButtons(message).map((button) => button.text);
}

function findButton(
  message: Api.Message,
  matches: (label: string) => boolean
): Api.InlineButtonTypeCallback | undefined {
  for (const button of inlineButtons(message)) {
    if (button.type instanceof Api.InlineButtonTypeCallback && matches(button.text)) {
      return button.type;
    }
  }
  return undefined;
}

/** Clicks an inline button and waits for BotFather to edit that message (or send a new one). */
async function clickAndAwaitResponse(
  client: TelegramClient,
  message: Api.Message,
  button: Api.InlineButtonTypeCallback
): Promise<Api.Message> {
  const watch: EditWatch = { messageId: message.id, signature: messageSignature(message) };
  const afterId = Math.max(message.id, await getLastMessageId(client));
  try {
    await client.invoke(
      new Api.messages.GetBotCallbackAnswer({
        peer: BOTFATHER,
        msgId: message.id,
        data: button.data,
      })
    );
  } catch (err) {
    // BotFather sometimes doesn't answer the callback query itself even
    // though it does edit the message; the edit is what we wait for.
    if (!(err instanceof Error && err.message.includes("BOT_RESPONSE_TIMEOUT"))) throw err;
  }
  return awaitResponse(client, afterId, watch);
}
