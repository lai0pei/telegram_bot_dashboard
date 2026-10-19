import { Api } from "teleproto/tl";
import type { TelegramClient } from "teleproto";
import { getClient } from "./mtproto";

const BOTFATHER = "BotFather";
const REPLY_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 500;

/**
 * Conversation engine for scripting @BotFather. All prompts/regexes BotFather
 * is expected to send live here, in one place, so they're easy to patch if
 * BotFather's wording changes. Every exported flow acquires `mutex` first so
 * two flows never interleave in the same chat.
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

const mutex = new Mutex();

export class BotFatherError extends Error {}

/** Sends a message to BotFather and waits for its next reply after `afterId`. */
async function sendAndAwaitReply(
  client: TelegramClient,
  text: string,
  afterId: number
): Promise<Api.Message> {
  await client.sendMessage(BOTFATHER, { message: text });
  return awaitReply(client, afterId);
}

async function awaitReply(client: TelegramClient, afterId: number): Promise<Api.Message> {
  const deadline = Date.now() + REPLY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const messages = await client.getMessages(BOTFATHER, { limit: 5 });
    const reply = messages.find((m) => m.id > afterId && m.out === false);
    if (reply) return reply;
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

async function withClient<T>(fn: (client: TelegramClient) => Promise<T>): Promise<T> {
  const client = await getClient();
  if (!client) throw new BotFatherError("Not logged in to Telegram.");
  const release = await mutex.acquire();
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

export async function createBot(name: string, username: string): Promise<CreateBotResult> {
  return withClient(async (client) => {
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

export async function deleteBot(username: string): Promise<void> {
  return withClient(async (client) => {
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

// --- Fetch existing token -------------------------------------------------

/**
 * Retrieves a bot's token via /mybots -> <bot> -> "API Token", clicking the
 * inline buttons BotFather sends rather than typing text.
 */
export async function fetchBotToken(username: string): Promise<string> {
  return withClient(async (client) => {
    let lastId = await getLastMessageId(client);

    let reply = await sendAndAwaitReply(client, "/mybots", lastId);
    lastId = reply.id;

    const handle = username.startsWith("@") ? username : `@${username}`;
    const botButton = findButton(reply, handle.replace(/^@/, ""));
    if (!botButton) {
      throw new BotFatherError(`BotFather's /mybots list doesn't include ${handle}.`);
    }

    reply = await clickAndAwaitReply(client, reply, botButton, lastId);
    lastId = reply.id;

    const tokenButton = findButton(reply, "API Token");
    if (!tokenButton) {
      throw new BotFatherError("Could not find the 'API Token' button for this bot.");
    }

    reply = await clickAndAwaitReply(client, reply, tokenButton, lastId);
    const tokenMatch = (reply.text ?? "").match(/(\d{6,}:[\w-]{30,})/);
    if (!tokenMatch) {
      throw new BotFatherError(`Unexpected BotFather reply while fetching the token: "${reply.text}"`);
    }
    return tokenMatch[1];
  });
}

/** Revokes a bot's token via /mybots -> <bot> -> "Revoke current token". */
export async function revokeBotToken(username: string): Promise<string> {
  return withClient(async (client) => {
    let lastId = await getLastMessageId(client);

    let reply = await sendAndAwaitReply(client, "/mybots", lastId);
    lastId = reply.id;

    const handle = username.startsWith("@") ? username : `@${username}`;
    const botButton = findButton(reply, handle.replace(/^@/, ""));
    if (!botButton) {
      throw new BotFatherError(`BotFather's /mybots list doesn't include ${handle}.`);
    }

    reply = await clickAndAwaitReply(client, reply, botButton, lastId);
    lastId = reply.id;

    const revokeButton = findButton(reply, "Revoke current token");
    if (!revokeButton) {
      throw new BotFatherError("Could not find the 'Revoke current token' button for this bot.");
    }

    reply = await clickAndAwaitReply(client, reply, revokeButton, lastId);
    const tokenMatch = (reply.text ?? "").match(/(\d{6,}:[\w-]{30,})/);
    if (!tokenMatch) {
      throw new BotFatherError(`Unexpected BotFather reply while revoking the token: "${reply.text}"`);
    }
    return tokenMatch[1];
  });
}

// --- Button helpers ---------------------------------------------------
//
// teleproto tracks a newer TL layer (230) than classic GramJS: inline
// keyboard buttons are `KeyboardInlineButton { text, type }`, where `type`
// is a union and the callback-data variant is `InlineButtonTypeCallback`.

function findButton(message: Api.Message, labelSubstring: string): Api.InlineButtonTypeCallback | undefined {
  const markup = message.replyMarkup;
  if (!markup || !(markup instanceof Api.ReplyInlineMarkup)) return undefined;
  const needle = labelSubstring.toLowerCase();
  for (const row of markup.rows) {
    for (const button of row.buttons) {
      if (button.type instanceof Api.InlineButtonTypeCallback && button.text.toLowerCase().includes(needle)) {
        return button.type;
      }
    }
  }
  return undefined;
}

async function clickAndAwaitReply(
  client: TelegramClient,
  message: Api.Message,
  button: Api.InlineButtonTypeCallback,
  afterId: number
): Promise<Api.Message> {
  await client.invoke(
    new Api.messages.GetBotCallbackAnswer({
      peer: BOTFATHER,
      msgId: message.id,
      data: button.data,
    })
  );
  return awaitReply(client, afterId);
}
