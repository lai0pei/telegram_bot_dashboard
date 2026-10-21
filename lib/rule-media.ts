import { and, count, eq, inArray } from "drizzle-orm";
import { BotApiError, botApi, type MediaMethod, type SendOptions, type TelegramMessage } from "./botapi";
import { db } from "./db";
import { autoReplies, ruleMedia } from "./db/schema";
import {
  MAX_RULE_FILE_BYTES,
  MAX_RULE_MEDIA_PER_BOT,
  MAX_RULE_PHOTO_BYTES,
  RULE_MEDIA_LABELS,
  parseFollowUps,
  parseRuleMedia,
  type FollowUp,
  type RuleMediaKind,
  type RuleMediaRef,
} from "./rule-content";
import { normalizeFollowUps, normalizeRuleMedia } from "./validation";

/**
 * Files attached to auto-reply rules. The bytes live in `rule_media` (per bot, since a Telegram `file_id` only works
 * for the bot that got the upload); after the first send the `file_id` is saved and later sends upload nothing.
 */
export type RuleMediaRow = typeof ruleMedia.$inferSelect;

const SEND_METHOD: Record<RuleMediaKind, MediaMethod> = {
  photo: "sendPhoto",
  video: "sendVideo",
  animation: "sendAnimation",
  document: "sendDocument",
  audio: "sendAudio",
  voice: "sendVoice",
  sticker: "sendSticker",
};

const ALLOWED_TYPES: Partial<Record<RuleMediaKind, string[]>> = {
  photo: ["image/jpeg", "image/png", "image/webp"],
  video: ["video/mp4"],
  animation: ["image/gif", "video/mp4"],
  audio: ["audio/mpeg", "audio/mp4", "audio/x-m4a"],
  voice: ["audio/ogg", "audio/mpeg", "audio/mp4", "audio/x-m4a"],
  sticker: ["image/webp", "video/webm", "application/x-tgsticker"],
};

/** Why this upload can't be sent as `kind`, or null. Documents can be anything. */
export function validateRuleUpload(kind: RuleMediaKind, file: { type: string; size: number }): string | null {
  if (file.size === 0) return "That file is empty.";
  const limit = kind === "photo" ? MAX_RULE_PHOTO_BYTES : MAX_RULE_FILE_BYTES;
  if (file.size > limit) return `${RULE_MEDIA_LABELS[kind]} files can be at most ${limit / 1024 / 1024} MB.`;
  const allowed = ALLOWED_TYPES[kind];
  if (allowed && !allowed.includes(file.type)) return `A ${RULE_MEDIA_LABELS[kind].toLowerCase()} must be ${allowed.map((t) => t.split("/")[1]).join(", ")}.`;
  return null;
}

/** Thrown when a bot is at its file limit; routes answer 422. */
export class RuleMediaLimitError extends Error {
  constructor() {
    super(`A bot can keep at most ${MAX_RULE_MEDIA_PER_BOT} attached files. Remove one from a rule first.`);
  }
}

export async function createRuleMedia(
  botId: number,
  kind: RuleMediaKind,
  file: { name: string; type: string; data: Buffer }
): Promise<RuleMediaRow> {
  const [{ n }] = await db.select({ n: count() }).from(ruleMedia).where(eq(ruleMedia.botId, botId));
  if (n >= MAX_RULE_MEDIA_PER_BOT) throw new RuleMediaLimitError();
  return (await db
    .insert(ruleMedia)
    .values({ botId, kind, name: file.name.slice(0, 200) || "file", mime: file.type, size: file.data.length, data: file.data, createdAt: new Date() })
    .returning())[0];
}

/** Every file of a bot without its bytes (sizes decide what a setup export can carry). */
export async function listRuleMediaMeta(botId: number): Promise<Pick<RuleMediaRow, "id" | "size">[]> {
  return await db.select({ id: ruleMedia.id, size: ruleMedia.size }).from(ruleMedia).where(eq(ruleMedia.botId, botId)).orderBy(ruleMedia.id);
}

/** Everything but the bytes: most reads (resolving a reference, sending by `file_id`) don't need a file that may be 20 MB. */
export type RuleMediaMeta = Omit<RuleMediaRow, "data">;

export async function getRuleMediaMeta(botId: number, id: number): Promise<RuleMediaMeta | undefined> {
  return (
    await db
      .select({
        id: ruleMedia.id,
        botId: ruleMedia.botId,
        kind: ruleMedia.kind,
        name: ruleMedia.name,
        mime: ruleMedia.mime,
        size: ruleMedia.size,
        fileId: ruleMedia.fileId,
        createdAt: ruleMedia.createdAt,
      })
      .from(ruleMedia)
      .where(and(eq(ruleMedia.botId, botId), eq(ruleMedia.id, id)))
  )[0];
}

/** The file with its bytes: only for uploading to Telegram, previewing, copying and exporting. */
export async function getRuleMedia(botId: number, id: number): Promise<RuleMediaRow | undefined> {
  return (await db.select().from(ruleMedia).where(and(eq(ruleMedia.botId, botId), eq(ruleMedia.id, id))))[0];
}

/** The reference as it should be stored: kind and name taken from the bot's own file, or null if that file isn't this bot's. */
export async function resolveMediaRef(botId: number, ref: { mediaId: number } | null | undefined): Promise<RuleMediaRef | null> {
  if (!ref) return null;
  const row = await getRuleMediaMeta(botId, ref.mediaId);
  return row ? { mediaId: row.id, kind: row.kind, name: row.name } : null;
}

/** Every file ID a rule's main message and follow-ups point at. */
export function mediaIdsOf(rule: { media: string | null; followUps: string | null }): number[] {
  const ids: number[] = [];
  const main = parseRuleMedia(rule.media);
  if (main) ids.push(main.mediaId);
  for (const f of parseFollowUps(rule.followUps)) if (f.kind === "media") ids.push(f.media.mediaId);
  return ids;
}

/** A new upload is kept this long even if no rule names it yet: it may belong to a rule still being written. */
const UNUSED_GRACE_MS = 60 * 60 * 1000;

/** Deletes the bot's files that no rule uses any more (after a rule is edited or removed) and are not brand new. */
export async function pruneRuleMedia(botId: number): Promise<void> {
  const used = new Set((await db.select().from(autoReplies).where(eq(autoReplies.botId, botId))).flatMap(mediaIdsOf));
  const all = await db.select({ id: ruleMedia.id, createdAt: ruleMedia.createdAt }).from(ruleMedia).where(eq(ruleMedia.botId, botId));
  const cutoff = Date.now() - UNUSED_GRACE_MS;
  const unused = all.filter((r) => !used.has(r.id) && r.createdAt.getTime() < cutoff).map((r) => r.id);
  if (unused.length) await db.delete(ruleMedia).where(and(eq(ruleMedia.botId, botId), inArray(ruleMedia.id, unused)));
}

/** Copies a file to another bot (cloning a bot's rules). The copy has no `file_id`: that one belongs to the first bot. */
export async function copyRuleMedia(fromBotId: number, toBotId: number, mediaId: number): Promise<RuleMediaRef | null> {
  const row = await getRuleMedia(fromBotId, mediaId);
  if (!row) return null;
  const copy = await createRuleMedia(toBotId, row.kind, { name: row.name, type: row.mime, data: row.data });
  return { mediaId: copy.id, kind: copy.kind, name: copy.name };
}

/**
 * The attachment and follow-ups of a validated request body in their stored form. Every file must be this bot's own
 * (an ID from another bot is refused, never copied), and its kind and name are taken from the stored row rather than
 * from the client.
 */
export async function prepareRuleContent(
  botId: number,
  body: { media?: unknown; followUps?: unknown }
): Promise<{ media: RuleMediaRef | null; followUps: FollowUp[] | null } | { error: string }> {
  const notYours = { error: "An attached file doesn't belong to this bot. Upload it again." };
  const media = normalizeRuleMedia(body.media);
  const resolvedMedia = media ? await resolveMediaRef(botId, media) : null;
  if (media && !resolvedMedia) return notYours;
  const followUps = normalizeFollowUps(body.followUps);
  for (const [i, f] of (followUps ?? []).entries()) {
    if (f.kind !== "media") continue;
    const resolved = await resolveMediaRef(botId, f.media);
    if (!resolved) return notYours;
    followUps![i] = { ...f, media: resolved };
  }
  return { media: resolvedMedia, followUps };
}

/** A rule's attachment and follow-ups with every file copied to `toBotId` (cloning rules between bots). Throws if a file is missing. */
export async function copyRuleContent(
  fromBotId: number,
  toBotId: number,
  rule: { media: string | null; followUps: string | null }
): Promise<{ media: RuleMediaRef | null; followUps: FollowUp[] }> {
  const copies = new Map<number, RuleMediaRef>();
  const copyOf = async (ref: RuleMediaRef): Promise<RuleMediaRef> => {
    const known = copies.get(ref.mediaId);
    if (known) return known;
    const copy = await copyRuleMedia(fromBotId, toBotId, ref.mediaId);
    if (!copy) throw new Error("A file attached to this rule is missing.");
    copies.set(ref.mediaId, copy);
    return copy;
  };
  const main = parseRuleMedia(rule.media);
  const followUps: FollowUp[] = [];
  for (const f of parseFollowUps(rule.followUps)) followUps.push(f.kind === "media" ? { ...f, media: await copyOf(f.media) } : f);
  return { media: main ? await copyOf(main) : null, followUps };
}

/** Telegram's wording when a `file_id` is not usable ("wrong file identifier", "wrong remote file identifier"). */
const FILE_ID_REFUSED = /wrong (remote )?file (identifier|id)|file_id|file reference/i;

function fileIdOf(sent: TelegramMessage, kind: RuleMediaKind): string | null {
  switch (kind) {
    case "photo":
      return sent.photo?.at(-1)?.file_id ?? null;
    case "video":
      return sent.video?.file_id ?? null;
    case "animation":
      return (sent.animation ?? sent.document)?.file_id ?? null;
    case "audio":
      return sent.audio?.file_id ?? null;
    case "voice":
      return sent.voice?.file_id ?? null;
    case "sticker":
      return sent.sticker?.file_id ?? null;
    default:
      return sent.document?.file_id ?? null;
  }
}

/**
 * Sends a stored file to a chat. Uses the saved `file_id` when there is one; if Telegram refuses it (400) or there
 * is none, uploads the bytes and saves the new `file_id` for next time. A sticker never has a caption.
 */
export async function sendRuleMedia(
  botId: number,
  token: string,
  chatId: number | string,
  ref: RuleMediaRef,
  caption: string | undefined,
  opts: SendOptions
): Promise<TelegramMessage> {
  const meta = await getRuleMediaMeta(botId, ref.mediaId);
  if (!meta) throw new Error("The file attached to this rule was deleted.");
  const method = SEND_METHOD[meta.kind];
  const text = meta.kind === "sticker" ? undefined : caption;
  if (meta.fileId) {
    try {
      return await botApi.sendMediaById(token, method, chatId, meta.fileId, text, opts);
    } catch (err) {
      // Only a refused file identifier means the cached one is bad; a bad caption or chat (also 400) must keep it.
      if (!(err instanceof BotApiError) || err.errorCode !== 400 || !FILE_ID_REFUSED.test(err.description)) throw err;
      await db.update(ruleMedia).set({ fileId: null }).where(eq(ruleMedia.id, meta.id));
    }
  }
  // The bytes are read only now, when there is something to upload.
  const row = await getRuleMedia(botId, ref.mediaId);
  if (!row) throw new Error("The file attached to this rule was deleted.");
  const sent = await botApi.sendMedia(token, method, chatId, { name: row.name, type: row.mime, data: row.data }, text, opts);
  const fileId = fileIdOf(sent, row.kind);
  if (fileId) await db.update(ruleMedia).set({ fileId }).where(eq(ruleMedia.id, row.id));
  return sent;
}
