import type { TelegramMessage, TelegramPoll } from "./botapi";
import type { botMessages } from "./db/schema";

type BotMessage = typeof botMessages.$inferSelect;

type MediaType = NonNullable<BotMessage["mediaType"]>;

/** The text a stored message shows (a caption counts as text) and what kind of media it carries, if any. */
export function describeMessage(message: TelegramMessage): { text: string | null; mediaType: MediaType | null } {
  const text =
    message.text ??
    message.caption ??
    (message.poll ? `📊 ${message.poll.question}` : null) ??
    (message.contact ? `📇 ${[message.contact.first_name, message.contact.last_name].filter(Boolean).join(" ")} ${message.contact.phone_number}` : null) ??
    (message.venue ? `📍 ${message.venue.title}, ${message.venue.address}` : null) ??
    (message.location ? `📍 ${message.location.latitude}, ${message.location.longitude}` : null) ??
    (message.dice ? `${message.dice.emoji} ${message.dice.value}` : null) ??
    (message.users_shared
      ? `👥 Shared ${message.users_shared.users.length === 1 ? "a user" : `${message.users_shared.users.length} users`} (request ${message.users_shared.request_id}): ${message.users_shared.users
          .map((u) => [u.first_name, u.username && `@${u.username}`].filter(Boolean).join(" ") || String(u.user_id))
          .join(", ")}`
      : null) ??
    (message.chat_shared
      ? `💬 Shared a chat (request ${message.chat_shared.request_id}): ${message.chat_shared.title ?? message.chat_shared.username ?? message.chat_shared.chat_id}`
      : null) ??
    (message.web_app_data ? `🧩 Mini App data (${message.web_app_data.button_text}): ${message.web_app_data.data}` : null) ??
    (message.video_note ? "⭕ Video message" : null) ??
    (message.animation ? "🎞 Animation" : null) ??
    (message.story ? "📖 Story" : null);
  let mediaType: MediaType | null = null;
  if (message.poll) mediaType = "poll";
  else if (message.photo?.length) mediaType = "photo";
  else if (message.document) mediaType = "document";
  else if (message.video) mediaType = "video";
  else if (message.audio) mediaType = "audio";
  else if (message.voice) mediaType = "voice";
  else if (message.sticker) mediaType = "sticker";
  else if (!message.text) mediaType = "other";
  return { text, mediaType };
}

/** The file_id to download for a stored message's media (largest photo size), or null. */
export function mediaFileId(message: TelegramMessage): { fileId: string; mimeType: string | null; fileName: string | null } | null {
  if (message.photo?.length) {
    const largest = message.photo[message.photo.length - 1];
    return { fileId: largest.file_id, mimeType: "image/jpeg", fileName: null };
  }
  const file = message.document ?? message.video ?? message.audio ?? message.voice ?? message.sticker;
  return file ? { fileId: file.file_id, mimeType: file.mime_type ?? null, fileName: file.file_name ?? null } : null;
}

/** The poll inside a stored poll message's raw JSON (kept current by the poller), or null. */
function pollOf(m: BotMessage): TelegramPoll | null {
  if (m.mediaType !== "poll" || !m.raw) return null;
  try {
    return (JSON.parse(m.raw) as TelegramMessage).poll ?? null;
  } catch {
    return null;
  }
}

/** The shape the dashboard receives for a stored message (no raw JSON). */
export function toMessageRow(m: BotMessage) {
  return {
    id: m.id,
    chatId: m.chatId,
    fromUserId: m.fromUserId,
    fromUsername: m.fromUsername,
    fromFirstName: m.fromFirstName,
    direction: m.direction,
    text: m.text,
    mediaType: m.mediaType,
    replyToMessageId: m.replyToMessageId,
    editedAt: m.editedAt,
    pinned: m.pinned,
    businessConnectionId: m.businessConnectionId,
    deletedAt: m.deletedAt,
    telegramMessageId: m.telegramMessageId,
    createdAt: m.createdAt,
    poll: pollOf(m),
  };
}

/** Which Bot API send method fits an uploaded file. Images over 10 MB (or sent as a file on purpose) go as documents. */
export function pickMediaMethod(type: string, size: number, asFile: boolean): "sendPhoto" | "sendDocument" | "sendVideo" | "sendAudio" {
  if (asFile) return "sendDocument";
  if ((type === "image/jpeg" || type === "image/png" || type === "image/webp") && size <= 10 * 1024 * 1024) return "sendPhoto";
  if (type === "video/mp4") return "sendVideo";
  if (type === "audio/mpeg" || type === "audio/mp4" || type === "audio/x-m4a") return "sendAudio";
  return "sendDocument";
}
