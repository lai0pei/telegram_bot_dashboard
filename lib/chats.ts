import { and, eq } from "drizzle-orm";
import { helpers, type TelegramClient } from "teleproto";
import { uploads } from "teleproto/client";
import { Api } from "teleproto/tl";
import { RPCError } from "teleproto/errors";
import { db } from "./db";
import { chats } from "./db/schema";
import { getClient } from "./mtproto";
import { singleFlight } from "./single-flight";
import { asPhotoBuffer } from "./photos";

export type ChatRow = typeof chats.$inferSelect;
export type ChatKind = ChatRow["kind"];

export class ChatError extends Error {}

// --- Local rows ---------------------------------------------------------

export function listChats(ownerUserId: string): ChatRow[] {
  return db.select().from(chats).where(eq(chats.ownerUserId, ownerUserId)).all();
}

/** Scoped to the owner, so a chat ID that belongs to someone else returns undefined (-> 404). */
export function getChatById(id: number, ownerUserId: string): ChatRow | undefined {
  return db
    .select()
    .from(chats)
    .where(and(eq(chats.id, id), eq(chats.ownerUserId, ownerUserId)))
    .all()[0];
}

type ChatInfo = Pick<ChatRow, "telegramId" | "kind" | "accessHash" | "title" | "username" | "isCreator">;

export function upsertChatFromTelegram(ownerUserId: string, info: ChatInfo): ChatRow {
  const now = new Date();
  const existing = db
    .select()
    .from(chats)
    .where(and(eq(chats.ownerUserId, ownerUserId), eq(chats.telegramId, info.telegramId)))
    .all()[0];
  if (existing) {
    db.update(chats)
      .set({ ...info, updatedAt: now })
      .where(eq(chats.id, existing.id))
      .run();
    return { ...existing, ...info, updatedAt: now };
  }
  return db
    .insert(chats)
    .values({ ownerUserId, ...info, createdAt: now, updatedAt: now })
    .returning()
    .all()[0];
}

export function deleteChatRow(id: number): void {
  db.delete(chats).where(eq(chats.id, id)).run();
}

/** Removes local rows for chats Telegram no longer lists as owned/admined by this user. */
export function pruneChatsNotIn(ownerUserId: string, telegramIds: Set<string>): void {
  for (const chat of listChats(ownerUserId)) {
    if (!telegramIds.has(chat.telegramId)) deleteChatRow(chat.id);
  }
}

/** The ID bots use for this chat with the Bot API (e.g. sendMessage's chat_id). */
export function botApiChatId(row: Pick<ChatRow, "kind" | "telegramId">): string {
  return row.kind === "group" ? `-${row.telegramId}` : `-100${row.telegramId}`;
}

// --- Telegram entities -----------------------------------------------------

/** Extracts what we store from a channel/chat entity, or null if it isn't one this user manages. */
function chatInfoFromEntity(entity: unknown): ChatInfo | null {
  if (entity instanceof Api.Channel) {
    if (entity.left || (!entity.creator && !entity.adminRights)) return null;
    return {
      telegramId: entity.id.toString(),
      kind: entity.broadcast ? "channel" : "supergroup",
      accessHash: entity.accessHash?.toString() ?? null,
      title: entity.title,
      username: entity.username ?? entity.usernames?.find((u) => u.active)?.username ?? null,
      isCreator: !!entity.creator,
    };
  }
  if (entity instanceof Api.Chat) {
    if (entity.left || entity.deactivated || entity.migratedTo) return null;
    if (!entity.creator && !entity.adminRights) return null;
    return {
      telegramId: entity.id.toString(),
      kind: "group",
      accessHash: null,
      title: entity.title,
      username: null,
      isCreator: !!entity.creator,
    };
  }
  return null;
}

function inputChannel(row: ChatRow): Api.InputChannel {
  return new Api.InputChannel({
    channelId: helpers.returnBigInt(row.telegramId),
    accessHash: helpers.returnBigInt(row.accessHash ?? "0"),
  });
}

function inputPeer(row: ChatRow): Api.TypeInputPeer {
  if (row.kind === "group") return new Api.InputPeerChat({ chatId: helpers.returnBigInt(row.telegramId) });
  return new Api.InputPeerChannel({
    channelId: helpers.returnBigInt(row.telegramId),
    accessHash: helpers.returnBigInt(row.accessHash ?? "0"),
  });
}

async function requireClient(userId: string): Promise<TelegramClient> {
  const client = await getClient(userId);
  if (!client) throw new ChatError("Not logged in to Telegram.");
  return client;
}

/** True for RPC errors whose message is one of `codes` (e.g. CHAT_NOT_MODIFIED). */
function isRpcError(err: unknown, ...codes: string[]): boolean {
  return err instanceof RPCError && codes.some((c) => err.errorMessage === c);
}

const FRIENDLY_ERRORS: Record<string, string> = {
  USERNAME_OCCUPIED: "That username is already taken.",
  USERNAME_INVALID: "That username is invalid.",
  USERNAME_PURCHASE_AVAILABLE: "That username is only available for purchase on Fragment.",
  CHANNELS_ADMIN_PUBLIC_TOO_MUCH: "You own too many public channels/groups. Make one private first.",
  CHAT_ADMIN_REQUIRED: "You don't have admin rights for that.",
  CHAT_TITLE_EMPTY: "Title is required.",
  BOT_GROUPS_BLOCKED: "This bot can't be added to groups (enable it with BotFather's /setjoingroups).",
  USER_PRIVACY_RESTRICTED: "This user's privacy settings prevent adding them.",
  RIGHT_FORBIDDEN: "You can't grant those admin rights.",
  PHOTO_INVALID: "Telegram rejected that image.",
  PHOTO_CROP_SIZE_SMALL: "That image is too small. Use at least 160×160 pixels.",
  PHOTO_EXT_INVALID: "Telegram doesn't accept that image format.",
  CHAT_NOT_MODIFIED: "The photo is already that.",
};

/** Re-throws Telegram RPC errors with a readable message where we know one. */
function rethrowFriendly(err: unknown): never {
  if (err instanceof RPCError && FRIENDLY_ERRORS[err.errorMessage]) {
    throw new ChatError(FRIENDLY_ERRORS[err.errorMessage]);
  }
  throw err;
}

// --- Flows -------------------------------------------------------------

/** Syncs this user's local chat list against the channels/groups they own or admin. */
export function syncChats(userId: string): Promise<ChatRow[]> {
  return singleFlight(`sync-chats:${userId}`, async () => {
    const client = await requireClient(userId);
    const seen = new Set<string>();
    for await (const dialog of client.iterDialogs({ ignoreMigrated: true })) {
      const info = chatInfoFromEntity(dialog.entity);
      if (!info) continue;
      upsertChatFromTelegram(userId, info);
      seen.add(info.telegramId);
    }
    pruneChatsNotIn(userId, seen);
    return listChats(userId);
  });
}

/** Creates a channel or a supergroup (Telegram no longer offers basic groups for new chats). */
export async function createChat(
  userId: string,
  input: { kind: "channel" | "supergroup"; title: string; about: string }
): Promise<ChatRow> {
  const client = await requireClient(userId);
  const updates = await client
    .invoke(
      new Api.channels.CreateChannel({
        broadcast: input.kind === "channel",
        megagroup: input.kind === "supergroup",
        title: input.title,
        about: input.about,
      })
    )
    .catch(rethrowFriendly);

  const created = "chats" in updates ? updates.chats.find((c) => c instanceof Api.Channel) : undefined;
  const info = chatInfoFromEntity(created);
  if (!info) throw new ChatError("Telegram did not return the created chat.");
  return upsertChatFromTelegram(userId, info);
}

export interface ChatDetail {
  about: string;
  participantsCount: number | null;
  inviteLink: string | null;
  canChangeInfo: boolean;
  canInviteUsers: boolean;
  canAddAdmins: boolean;
}

/** Fetches live details and refreshes the local row (title/username can change outside the dashboard). */
export async function getChatDetail(userId: string, row: ChatRow): Promise<{ row: ChatRow; detail: ChatDetail }> {
  const client = await requireClient(userId);
  const full =
    row.kind === "group"
      ? await client.invoke(new Api.messages.GetFullChat({ chatId: helpers.returnBigInt(row.telegramId) }))
      : await client.invoke(new Api.channels.GetFullChannel({ channel: inputChannel(row) }));

  const entity = full.chats.find((c) => c.id.toString() === row.telegramId);
  const info = chatInfoFromEntity(entity);
  if (!info) {
    // No longer owned/admined (left, demoted, migrated) — drop it so the list stays truthful.
    deleteChatRow(row.id);
    throw new ChatError("You no longer manage this chat.");
  }
  const refreshed = upsertChatFromTelegram(userId, info);

  const rights = entity instanceof Api.Channel || entity instanceof Api.Chat ? entity.adminRights : undefined;
  const can = (right: keyof Api.ChatAdminRights) => refreshed.isCreator || !!rights?.[right];

  const fullChat = full.fullChat;
  const exported = "exportedInvite" in fullChat ? fullChat.exportedInvite : undefined;
  const invite = exported instanceof Api.ChatInviteExported ? exported.link : null;
  const participantsCount =
    fullChat instanceof Api.ChannelFull
      ? (fullChat.participantsCount ?? null)
      : entity instanceof Api.Chat
        ? entity.participantsCount
        : null;

  return {
    row: refreshed,
    detail: {
      about: fullChat.about,
      participantsCount,
      inviteLink: invite,
      canChangeInfo: can("changeInfo"),
      canInviteUsers: can("inviteUsers"),
      canAddAdmins: can("addAdmins"),
    },
  };
}

/** Applies a sparse set of edits. Fields equal to their current value are no-ops rather than errors. */
export async function editChat(
  userId: string,
  row: ChatRow,
  changes: { title?: string; about?: string; username?: string }
): Promise<string[]> {
  const client = await requireClient(userId);
  const applied: string[] = [];

  try {
    if (changes.title !== undefined) {
      const request =
        row.kind === "group"
          ? new Api.messages.EditChatTitle({ chatId: helpers.returnBigInt(row.telegramId), title: changes.title })
          : new Api.channels.EditTitle({ channel: inputChannel(row), title: changes.title });
      await client.invoke(request).catch((err) => {
        if (!isRpcError(err, "CHAT_NOT_MODIFIED")) throw err;
      });
      applied.push("title");
    }

    if (changes.about !== undefined) {
      await client
        .invoke(new Api.messages.EditChatAbout({ peer: inputPeer(row), about: changes.about }))
        .catch((err) => {
          if (!isRpcError(err, "CHAT_ABOUT_NOT_MODIFIED")) throw err;
        });
      applied.push("about");
    }

    if (changes.username !== undefined) {
      if (row.kind === "group") throw new ChatError("Basic groups can't have a public username.");
      const username = changes.username;
      if (username !== (row.username ?? "")) {
        if (username) {
          const available = await client.invoke(
            new Api.channels.CheckUsername({ channel: inputChannel(row), username })
          );
          if (!available) throw new ChatError("That username is already taken.");
        }
        await client
          .invoke(new Api.channels.UpdateUsername({ channel: inputChannel(row), username }))
          .catch((err) => {
            if (!isRpcError(err, "USERNAME_NOT_MODIFIED")) throw err;
          });
      }
      applied.push("username");
    }
  } catch (err) {
    rethrowFriendly(err);
  }

  return applied;
}

/** Revokes the current primary invite link and returns a new one. */
export function regenerateInviteLink(userId: string, row: ChatRow): Promise<string> {
  return singleFlight(`invite:${userId}:${row.id}`, async () => {
    const client = await requireClient(userId);
    const invite = await client
      .invoke(new Api.messages.ExportChatInvite({ peer: inputPeer(row), legacyRevokePermanent: true }))
      .catch(rethrowFriendly);
    if (!(invite instanceof Api.ChatInviteExported)) throw new ChatError("Telegram did not return an invite link.");
    return invite.link;
  });
}

/** Adds one of the user's bots to the chat as an admin with a sensible default set of rights. */
export async function addBotAsAdmin(userId: string, row: ChatRow, botUsername: string): Promise<void> {
  const client = await requireClient(userId);
  try {
    const bot = await client.getInputEntity(botUsername);

    if (row.kind === "group") {
      const chatId = helpers.returnBigInt(row.telegramId);
      await client.invoke(new Api.messages.AddChatUser({ chatId, userId: bot, fwdLimit: 0 })).catch((err) => {
        if (!isRpcError(err, "USER_ALREADY_PARTICIPANT")) throw err;
      });
      await client.invoke(new Api.messages.EditChatAdmin({ chatId, userId: bot, isAdmin: true }));
      return;
    }

    const adminRights =
      row.kind === "channel"
        ? new Api.ChatAdminRights({
            postMessages: true,
            editMessages: true,
            deleteMessages: true,
            inviteUsers: true,
          })
        : new Api.ChatAdminRights({
            deleteMessages: true,
            banUsers: true,
            pinMessages: true,
            inviteUsers: true,
          });
    await client.invoke(new Api.channels.EditAdmin({ channel: inputChannel(row), userId: bot, adminRights, rank: "" }));
  } catch (err) {
    rethrowFriendly(err);
  }
}

/** Permanently deletes the chat on Telegram (creator only) and removes the local row. */
export function deleteChat(userId: string, row: ChatRow): Promise<void> {
  return singleFlight(`delete-chat:${userId}:${row.id}`, async () => {
    if (!row.isCreator) throw new ChatError("Only the creator can delete this chat.");
    const client = await requireClient(userId);
    const request =
      row.kind === "group"
        ? new Api.messages.DeleteChat({ chatId: helpers.returnBigInt(row.telegramId) })
        : new Api.channels.DeleteChannel({ channel: inputChannel(row) });
    await client.invoke(request).catch(rethrowFriendly);
    deleteChatRow(row.id);
  });
}

// --- Profile photo ---------------------------------------------------------

/** The chat's current small photo, or null if it has none. */
export async function getChatPhoto(userId: string, row: ChatRow): Promise<Buffer | null> {
  const client = await requireClient(userId);
  const entity = await client.getEntity(inputPeer(row));
  return asPhotoBuffer(await client.downloadProfilePhoto(entity, { isBig: false }));
}

async function applyChatPhoto(userId: string, row: ChatRow, photo: Api.TypeInputChatPhoto): Promise<void> {
  const client = await requireClient(userId);
  const request =
    row.kind === "group"
      ? new Api.messages.EditChatPhoto({ chatId: helpers.returnBigInt(row.telegramId), photo })
      : new Api.channels.EditPhoto({ channel: inputChannel(row), photo });
  await client.invoke(request).catch(rethrowFriendly);
}

export async function setChatPhoto(userId: string, row: ChatRow, file: { name: string; data: Buffer }): Promise<void> {
  const client = await requireClient(userId);
  const uploaded = await client.uploadFile({
    file: new uploads.CustomFile(file.name, file.data.length, "", file.data),
    workers: 1,
  });
  await applyChatPhoto(userId, row, new Api.InputChatUploadedPhoto({ file: uploaded }));
}

export function deleteChatPhoto(userId: string, row: ChatRow): Promise<void> {
  return applyChatPhoto(userId, row, new Api.InputChatPhotoEmpty());
}
