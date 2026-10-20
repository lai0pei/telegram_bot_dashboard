import { uploads } from "teleproto/client";
import type { Api } from "teleproto/tl";
import type { TelegramClient } from "teleproto";
import {
  BotFatherError,
  awaitResponse,
  buttonLabels,
  clickAndAwaitResponse,
  findButton,
  getLastMessageId,
  isStillAdminedBot,
  openBotMenu,
  replyKeyboardLabels,
  sendAndAwaitReply,
  withClient,
} from "./botfather";

/**
 * Scripted BotFather dialogues for games, Mini Apps and ownership transfer. Same rules as the settings engine
 * (lib/botfather.ts `runSettingOn`): nothing BotFather says is trusted blindly. Each step checks BotFather's last reply
 * against a loose hint before answering, a choice is only made when a matching button really exists, and any mismatch
 * throws a `BotFatherError` quoting BotFather's actual words instead of guessing.
 *
 * NONE of these dialogues has been recorded against the real BotFather yet (`BOTFATHER_APP_FLOWS_CONFIRMED`), so the
 * hints are informed guesses; the UI says so. Expect to adjust the regexes after the first real run.
 */
export const BOTFATHER_APP_FLOWS_CONFIRMED = false;

/** Games and Mini Apps want a 640×360 picture. */
export const APP_PHOTO_SIZE = { width: 640, height: 360 };

type Content = { text: string } | { file: { name: string; data: Buffer } };

interface Step {
  /** Loose hint BotFather's previous reply must match before this step's content is sent. */
  expect: RegExp;
  /** What that hint stands for, for the error message. */
  what: string;
  send: Content;
}

const quote = (reply: Api.Message) => `"${(reply.text ?? "").slice(0, 300)}"`;

async function sendContent(client: TelegramClient, content: Content, afterId: number): Promise<Api.Message> {
  if ("text" in content) return sendAndAwaitReply(client, content.text, afterId);
  await client.sendFile("BotFather", {
    file: new uploads.CustomFile(content.file.name, content.file.data.length, "", content.file.data),
    forceDocument: false,
  });
  return awaitResponse(client, afterId);
}

/** Runs `opening` then each step in turn; returns BotFather's reply to the last step. */
async function runDialogue(client: TelegramClient, opening: string, steps: Step[]): Promise<Api.Message> {
  let lastId = await getLastMessageId(client);
  let reply = await sendAndAwaitReply(client, opening, lastId);
  for (const step of steps) {
    lastId = reply.id;
    if (!step.expect.test(reply.text ?? "")) {
      throw new BotFatherError(`Unexpected BotFather reply to ${opening} (expected it to ask for ${step.what}): ${quote(reply)}`);
    }
    reply = await sendContent(client, step.send, lastId);
  }
  return reply;
}

function requireSuccess(reply: Api.Message, success: RegExp, doing: string): void {
  if (!success.test(reply.text ?? "")) throw new BotFatherError(`BotFather didn't confirm ${doing}: ${quote(reply)}`);
}

/** Picks an option on BotFather's reply: a reply-keyboard label is sent as text, an inline button is clicked. */
async function choose(client: TelegramClient, reply: Api.Message, wanted: (label: string) => boolean, what: string, twoFaPassword?: string): Promise<Api.Message> {
  const keyboardLabel = replyKeyboardLabels(reply).find((l) => wanted(l.trim()));
  if (keyboardLabel) return sendAndAwaitReply(client, keyboardLabel, reply.id);
  const button = findButton(reply, (l) => wanted(l.trim()));
  if (button) return clickAndAwaitResponse(client, reply, button, button.requiresPassword ? twoFaPassword : undefined);
  const options = [...replyKeyboardLabels(reply), ...buttonLabels(reply)];
  throw new BotFatherError(`BotFather offered no option for ${what}. It said ${quote(reply)} (options: ${options.join(", ") || "none"}).`);
}

const handleOf = (username: string) => `@${username.replace(/^@/, "")}`;

// --- Image helpers ---------------------------------------------------------------------

/** Width × height of a PNG or JPEG, or null if the bytes are neither (no dependency needed for two headers). */
export function imageSize(data: Buffer): { width: number; height: number } | null {
  if (data.length > 24 && data.readUInt32BE(0) === 0x89504e47) return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    let i = 2;
    while (i + 9 < data.length) {
      if (data[i] !== 0xff) return null;
      const marker = data[i + 1];
      // Start-of-frame markers carry the size; 0xC4 (DHT), 0xC8 and 0xCC are not frames.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: data.readUInt16BE(i + 5), width: data.readUInt16BE(i + 7) };
      i += 2 + data.readUInt16BE(i + 2);
    }
  }
  return null;
}

/** Error text unless the image is a PNG/JPEG of exactly 640×360. */
export function validateAppPhoto(data: Buffer): string | null {
  const size = imageSize(data);
  if (!size) return "The picture must be a PNG or JPEG image.";
  if (size.width !== APP_PHOTO_SIZE.width || size.height !== APP_PHOTO_SIZE.height) {
    return `The picture must be exactly ${APP_PHOTO_SIZE.width}×${APP_PHOTO_SIZE.height} pixels (it is ${size.width}×${size.height}).`;
  }
  return null;
}

// --- Games -----------------------------------------------------------------------------

export interface NewAppInput {
  title: string;
  description: string;
  shortName: string;
  photo: { name: string; data: Buffer };
}

/** /newgame: bot → title → description → 640×360 picture → (no GIF) → short name. */
export async function createGame(userId: string, username: string, input: NewAppInput): Promise<string> {
  return withClient(userId, async (client) => {
    const done = await runDialogue(client, "/newgame", [
      { expect: /bot/i, what: "a bot", send: { text: handleOf(username) } },
      { expect: /title/i, what: "the game's title", send: { text: input.title } },
      { expect: /description/i, what: "a description", send: { text: input.description } },
      { expect: /photo|picture|image/i, what: "a picture", send: { file: input.photo } },
      { expect: /gif|animation|empty/i, what: "an optional GIF", send: { text: "/empty" } },
      { expect: /short ?name|address|link/i, what: "a short name", send: { text: input.shortName } },
    ]);
    requireSuccess(done, /done|congratulations|success|created|ready/i, "creating the game");
    return done.text ?? "";
  });
}

/** /deletegame: bot → the game (by short name or title) → confirmation. */
export async function deleteGame(userId: string, username: string, game: { shortName: string; title: string }): Promise<void> {
  return withClient(userId, async (client) => {
    const matchesGame = (label: string) => [game.shortName, game.title].some((n) => label.toLowerCase().includes(n.toLowerCase()));
    let reply = await sendAndAwaitReply(client, "/deletegame", await getLastMessageId(client));
    if (!/bot/i.test(reply.text ?? "")) throw new BotFatherError(`Unexpected BotFather reply to /deletegame: ${quote(reply)}`);
    reply = await sendAndAwaitReply(client, handleOf(username), reply.id);
    reply = await choose(client, reply, matchesGame, `the game "${game.title}"`);
    // Deleting is irreversible: only go on if BotFather asks and offers an explicit "yes".
    if (/sure|confirm|delete/i.test(reply.text ?? "")) reply = await choose(client, reply, (l) => /^(yes|delete|confirm)/i.test(l), "confirming the deletion");
    requireSuccess(reply, /deleted|removed|gone|done/i, "deleting the game");
  });
}

// --- Mini Apps -------------------------------------------------------------------------

/** /newapp: bot → title → description → 640×360 picture → (no GIF) → Web App URL → short name. */
export async function createMiniApp(userId: string, username: string, input: NewAppInput & { url: string }): Promise<string> {
  return withClient(userId, async (client) => {
    const done = await runDialogue(client, "/newapp", [
      { expect: /bot/i, what: "a bot", send: { text: handleOf(username) } },
      { expect: /title/i, what: "the app's title", send: { text: input.title } },
      { expect: /description/i, what: "a description", send: { text: input.description } },
      { expect: /photo|picture|image/i, what: "a picture", send: { file: input.photo } },
      { expect: /gif|animation|empty/i, what: "an optional GIF", send: { text: "/empty" } },
      { expect: /url|link|web ?app/i, what: "the Web App URL", send: { text: input.url } },
      { expect: /short ?name|address/i, what: "a short name", send: { text: input.shortName } },
    ]);
    requireSuccess(done, /done|congratulations|success|created|ready/i, "creating the Mini App");
    return done.text ?? "";
  });
}

/** /myapps: bot → the app → "Delete App" → confirmation. */
export async function deleteMiniApp(userId: string, username: string, app: { shortName: string; title: string }): Promise<void> {
  return withClient(userId, async (client) => {
    const matchesApp = (label: string) => [app.shortName, app.title].some((n) => label.toLowerCase().includes(n.toLowerCase()));
    let reply = await sendAndAwaitReply(client, "/myapps", await getLastMessageId(client));
    if (/bot/i.test(reply.text ?? "") || replyKeyboardLabels(reply).length) reply = await sendAndAwaitReply(client, handleOf(username), reply.id);
    reply = await choose(client, reply, matchesApp, `the Mini App "${app.title}"`);
    reply = await choose(client, reply, (l) => /delete/i.test(l), "deleting the app");
    if (/sure|confirm|delete/i.test(reply.text ?? "") && (buttonLabels(reply).length || replyKeyboardLabels(reply).length)) {
      reply = await choose(client, reply, (l) => /^(yes|delete|confirm)/i.test(l), "confirming the deletion");
    }
    requireSuccess(reply, /deleted|removed|gone|done/i, "deleting the Mini App");
  });
}

// --- Ownership transfer ------------------------------------------------------------------

/**
 * /mybots → bot → "Transfer Ownership" → recipient → confirm. Telegram protects the confirmation with the account's
 * 2FA password (a callback button that `requiresPassword`), so `twoFaPassword` is checked with SRP against Telegram
 * and is only held in memory for this call. Success is double-checked against `bots.getAdminedBots`: the bot must no
 * longer be ours, whatever BotFather's wording.
 */
export async function transferBot(userId: string, username: string, recipient: string, twoFaPassword: string): Promise<void> {
  return withClient(userId, async (client) => {
    const menu = await openBotMenu(client, username);
    const transfer = findButton(menu, (label) => /transfer/i.test(label));
    if (!transfer) throw new BotFatherError(`BotFather's menu for ${handleOf(username)} has no transfer button. It said ${quote(menu)}.`);
    let reply = await clickAndAwaitResponse(client, menu, transfer);

    // BotFather asks who gets the bot (unless it jumped straight to a confirmation button).
    const isConfirm = (label: string) => /yes|confirm|transfer|sure|accept/i.test(label);
    if (!findButton(reply, isConfirm)) {
      if (!/user|username|recipient|send|choose|who/i.test(reply.text ?? "")) {
        throw new BotFatherError(`Unexpected BotFather reply while transferring ${handleOf(username)}: ${quote(reply)}`);
      }
      reply = await sendAndAwaitReply(client, handleOf(recipient), reply.id);
    }
    reply = await choose(client, reply, isConfirm, "confirming the transfer", twoFaPassword);

    if (await isStillAdminedBot(client, username)) {
      throw new BotFatherError(`The bot is still yours after the transfer. BotFather said ${quote(reply)}.`);
    }
  });
}
