/** Client-safe parts of the deep-link feature (no database access): kinds, rights and validation. */

export type DeepLinkKind = "start" | "startgroup" | "startchannel" | "startapp";

export const DEEP_LINK_KINDS: DeepLinkKind[] = ["start", "startgroup", "startchannel", "startapp"];

/** Rights a `startgroup` / `startchannel` link can ask the bot to be added with (the `admin=` parameter). */
export const DEEP_LINK_ADMIN_RIGHTS = [
  "change_info",
  "post_messages",
  "edit_messages",
  "delete_messages",
  "restrict_members",
  "invite_users",
  "pin_messages",
  "manage_topics",
  "promote_members",
  "manage_video_chats",
  "anonymous",
  "manage_chat",
] as const;

export interface DeepLinkInput {
  label: string;
  kind: DeepLinkKind;
  payload: string;
  appShortName?: string | null;
  admin?: string[];
}

/** Error text for an invalid input, or null. Payloads are 1–64 of A-Z a-z 0-9 _ - (Telegram's limit for all four kinds). */
export function validateDeepLink(input: Partial<DeepLinkInput>): string | null {
  if (typeof input.label !== "string" || !input.label.trim() || input.label.length > 60) return "A label of 1–60 characters is required.";
  if (!DEEP_LINK_KINDS.includes(input.kind as DeepLinkKind)) return "Unknown link type.";
  if (typeof input.payload !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(input.payload)) return "A payload is 1–64 letters, digits, underscores or dashes.";
  if (input.appShortName) {
    if (input.kind !== "startapp") return "Only Mini App links take an app short name.";
    if (!/^[A-Za-z][A-Za-z0-9_]{2,31}$/.test(input.appShortName)) return "App short name is 3–32 letters, digits or underscores, starting with a letter.";
  }
  if (input.admin?.length) {
    if (input.kind !== "startgroup" && input.kind !== "startchannel") return "Admin rights only apply to add-to-group / add-to-channel links.";
    if (input.admin.some((r) => !(DEEP_LINK_ADMIN_RIGHTS as readonly string[]).includes(r))) return "Unknown admin right.";
  }
  return null;
}

