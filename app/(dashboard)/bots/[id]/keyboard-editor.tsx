"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isPrivateChatId, KEYBOARD_REQUEST_KEYS, type KeyboardButton, type ReplyKeyboard } from "@/lib/botapi";
import { validateReplyKeyboard } from "@/lib/validation";

export type KeyboardRequest = "" | "contact" | "location" | "users" | "chat" | "poll" | "web_app";

export interface KeyboardButtonDraft {
  text: string;
  /** What the button asks for when pressed (all private chats only). */
  request: KeyboardRequest;
  sameRow: boolean;
  /** `users` / `chat`: the ID the answer is reported with (match it with a "Shared" rule). */
  requestId: string;
  /** `web_app`: the Mini App URL. */
  url: string;
  /** `users`: how many users may be picked (1–10) and whether they must be bots (""=any). */
  maxUsers: string;
  userKind: "" | "bot" | "human";
  /** `chat`: group or channel, owned only, bot already a member. */
  chatKind: "group" | "channel";
  ownedOnly: boolean;
  botMember: boolean;
  /** `poll`: "" = any. */
  pollType: "" | "quiz" | "regular";
}

export type KeyboardMode = "none" | "keyboard" | "remove" | "force_reply";

export interface KeyboardDraft {
  mode: KeyboardMode;
  buttons: KeyboardButtonDraft[];
  persistent: boolean;
  resize: boolean;
  oneTime: boolean;
  placeholder: string;
}

export const emptyKeyboardDraft = (): KeyboardDraft => ({
  mode: "none",
  buttons: [],
  persistent: false,
  resize: true,
  oneTime: false,
  placeholder: "",
});

const emptyKeyboardButton = (): KeyboardButtonDraft => ({
  text: "",
  request: "",
  sameRow: false,
  requestId: "",
  url: "",
  maxUsers: "1",
  userKind: "",
  chatKind: "group",
  ownedOnly: false,
  botMember: false,
  pollType: "",
});

/** The next free request ID (1 + the highest one in use) so every request button in a keyboard is distinguishable. */
function nextRequestId(buttons: KeyboardButtonDraft[]): string {
  return String(Math.max(0, ...buttons.map((b) => Number(b.requestId) || 0)) + 1);
}

function toKeyboardButton(b: KeyboardButtonDraft): KeyboardButton {
  const base: KeyboardButton = { text: b.text.trim() };
  const requestId = Number(b.requestId);
  switch (b.request) {
    case "contact":
      return { ...base, request_contact: true };
    case "location":
      return { ...base, request_location: true };
    case "users": {
      const max = Number(b.maxUsers);
      return {
        ...base,
        request_users: {
          request_id: requestId,
          ...(max > 1 ? { max_quantity: max } : {}),
          ...(b.userKind ? { user_is_bot: b.userKind === "bot" } : {}),
        },
      };
    }
    case "chat":
      return {
        ...base,
        request_chat: {
          request_id: requestId,
          chat_is_channel: b.chatKind === "channel",
          ...(b.ownedOnly ? { chat_is_created: true } : {}),
          ...(b.botMember ? { bot_is_member: true } : {}),
        },
      };
    case "poll":
      return { ...base, request_poll: b.pollType ? { type: b.pollType } : {} };
    case "web_app":
      return { ...base, web_app: { url: b.url.trim() } };
    default:
      return base;
  }
}

function fromKeyboardButton(b: KeyboardButton, sameRow: boolean): KeyboardButtonDraft {
  const draft: KeyboardButtonDraft = { ...emptyKeyboardButton(), text: b.text, sameRow };
  if (b.request_contact) draft.request = "contact";
  else if (b.request_location) draft.request = "location";
  else if (b.request_users) {
    const u = b.request_users;
    Object.assign(draft, {
      request: "users",
      requestId: String(u.request_id),
      maxUsers: String(u.max_quantity ?? 1),
      userKind: u.user_is_bot === undefined ? "" : u.user_is_bot ? "bot" : "human",
    });
  } else if (b.request_chat) {
    const c = b.request_chat;
    Object.assign(draft, {
      request: "chat",
      requestId: String(c.request_id),
      chatKind: c.chat_is_channel ? "channel" : "group",
      ownedOnly: c.chat_is_created === true,
      botMember: c.bot_is_member === true,
    });
  } else if (b.request_poll) Object.assign(draft, { request: "poll", pollType: b.request_poll.type ?? "" });
  else if (b.web_app) Object.assign(draft, { request: "web_app", url: b.web_app.url });
  return draft;
}
const MAX_BUTTONS = 24;
const MAX_PER_ROW = 4;

/** The keyboard to send (undefined for "none"). Unfilled buttons are skipped; a keyboard with no buttons is invalid, not "none". */
export function draftToReplyKeyboard(d: KeyboardDraft): ReplyKeyboard | undefined {
  if (d.mode === "none") return undefined;
  if (d.mode === "remove") return { kind: "remove" };
  const placeholder = d.placeholder.trim() || undefined;
  if (d.mode === "force_reply") return { kind: "force_reply", placeholder };
  const rows: KeyboardButton[][] = [];
  for (const b of d.buttons.filter((x) => x.text.trim())) {
    const button = toKeyboardButton(b);
    const last = rows[rows.length - 1];
    if (b.sameRow && last && last.length < MAX_PER_ROW) last.push(button);
    else rows.push([button]);
  }
  return { kind: "keyboard", rows, persistent: d.persistent || undefined, resize: d.resize || undefined, oneTime: d.oneTime || undefined, placeholder };
}

export function replyKeyboardToDraft(k: ReplyKeyboard | null | undefined): KeyboardDraft {
  const draft = emptyKeyboardDraft();
  if (!k) return draft;
  if (k.kind === "remove") return { ...draft, mode: "remove" };
  if (k.kind === "force_reply") return { ...draft, mode: "force_reply", placeholder: k.placeholder ?? "" };
  return {
    mode: "keyboard",
    buttons: k.rows.flatMap((row) =>
      row.map((b, i) => fromKeyboardButton(b, i > 0))
    ),
    persistent: Boolean(k.persistent),
    resize: Boolean(k.resize),
    oneTime: Boolean(k.oneTime),
    placeholder: k.placeholder ?? "",
  };
}

/** Validation message for the draft; `chatId` (when known) rejects contact/location requests outside private chats. */
export function keyboardDraftError(d: KeyboardDraft, chatId?: string): string | null {
  if (d.mode === "none") return null;
  const keyboard = draftToReplyKeyboard(d);
  const error = validateReplyKeyboard(keyboard);
  if (error) return error;
  if (keyboard?.kind === "keyboard" && chatId !== undefined && !isPrivateChatId(chatId) && keyboard.rows.flat().some((b) => KEYBOARD_REQUEST_KEYS.some((k) => b[k]))) {
    return "Request and Mini App buttons only work in private chats.";
  }
  return null;
}

const field = "h-8 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-2 text-xs";

const MODE_HELP: Record<KeyboardMode, string> = {
  none: "",
  keyboard:
    "Big buttons replace the user's keyboard. Pressing one sends its text as a message, so add an Exact rule in Automation to answer each. Buttons that ask for a user, chat, poll or Mini App are answered by a Shared / Media rule instead.",
  remove: "Takes the current reply keyboard away from the chat.",
  force_reply: "Opens the reply box on the message, as if the user tapped Reply.",
};

export function KeyboardEditor({
  draft,
  onChange,
  chatId,
  disabledReason,
}: {
  draft: KeyboardDraft;
  onChange: (draft: KeyboardDraft) => void;
  /** The destination chat when known (hides nothing, but validates contact/location). Omit when it varies (auto-replies). */
  chatId?: string;
  /** Why a keyboard can't be used right now (for example inline buttons are set); shown instead of the controls. */
  disabledReason?: string | null;
}) {
  const error = keyboardDraftError(draft, chatId);
  const set = (patch: Partial<KeyboardDraft>) => onChange({ ...draft, ...patch });
  const update = (i: number, patch: Partial<KeyboardButtonDraft>) =>
    set({ buttons: draft.buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)) });

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <select
          value={draft.mode}
          disabled={Boolean(disabledReason)}
          onChange={(e) => {
            const mode = e.target.value as KeyboardMode;
            set({ mode, buttons: mode === "keyboard" && !draft.buttons.length ? [emptyKeyboardButton()] : draft.buttons });
          }}
          aria-label="Reply keyboard"
          className={field}
        >
          <option value="none">No reply keyboard</option>
          <option value="keyboard">Show a reply keyboard</option>
          <option value="remove">Remove the reply keyboard</option>
          <option value="force_reply">Force a reply</option>
        </select>
        {disabledReason && <span className="text-xs text-[var(--muted)]">{disabledReason}</span>}
      </div>
      {draft.mode !== "none" && <p className="text-xs text-[var(--muted)]">{MODE_HELP[draft.mode]}</p>}

      {draft.mode === "keyboard" && (
        <>
          {draft.buttons.map((b, i) => (
            <div key={i} className="flex flex-wrap gap-1.5 sm:flex-nowrap">
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => update(i, { sameRow: !b.sameRow })}
                  aria-pressed={b.sameRow}
                  title={b.sameRow ? "Same row as the button above" : "Starts a new row"}
                  className={`${field} w-8 shrink-0 text-center ${b.sameRow ? "bg-[var(--primary)] text-white" : "text-[var(--muted)]"}`}
                >
                  {b.sameRow ? "↔" : "↓"}
                </button>
              )}
              <input
                value={b.text}
                onChange={(e) => update(i, { text: e.target.value })}
                placeholder="Button text"
                maxLength={64}
                aria-label="Keyboard button text"
                className={`${field} min-w-0 flex-1`}
              />
              <select
                value={b.request}
                onChange={(e) => {
                  const request = e.target.value as KeyboardRequest;
                  update(i, { request, requestId: request === "users" || request === "chat" ? b.requestId || nextRequestId(draft.buttons) : b.requestId });
                }}
                aria-label="What the button asks for"
                className={field}
              >
                <option value="">Sends its text</option>
                <option value="contact">Asks for phone number</option>
                <option value="location">Asks for location</option>
                <option value="users">Asks to pick users</option>
                <option value="chat">Asks to pick a chat</option>
                <option value="poll">Asks to create a poll</option>
                <option value="web_app">Opens a Mini App</option>
              </select>
              {(b.request === "users" || b.request === "chat") && (
                <input
                  value={b.requestId}
                  onChange={(e) => update(i, { requestId: e.target.value.replace(/\D/g, "") })}
                  placeholder="ID"
                  inputMode="numeric"
                  aria-label="Request ID"
                  title="Request ID: the answer is reported with this number (match it with a Shared rule)"
                  className={`${field} w-14`}
                />
              )}
              {b.request === "users" && (
                <>
                  <input
                    value={b.maxUsers}
                    onChange={(e) => update(i, { maxUsers: e.target.value.replace(/\D/g, "") })}
                    aria-label="How many users"
                    title="How many users may be picked (1–10)"
                    inputMode="numeric"
                    className={`${field} w-12`}
                  />
                  <select value={b.userKind} onChange={(e) => update(i, { userKind: e.target.value as KeyboardButtonDraft["userKind"] })} aria-label="Kind of user" className={field}>
                    <option value="">Anyone</option>
                    <option value="human">People</option>
                    <option value="bot">Bots</option>
                  </select>
                </>
              )}
              {b.request === "chat" && (
                <>
                  <select value={b.chatKind} onChange={(e) => update(i, { chatKind: e.target.value as KeyboardButtonDraft["chatKind"] })} aria-label="Kind of chat" className={field}>
                    <option value="group">Group</option>
                    <option value="channel">Channel</option>
                  </select>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={b.ownedOnly} onChange={(e) => update(i, { ownedOnly: e.target.checked })} />
                    owned
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={b.botMember} onChange={(e) => update(i, { botMember: e.target.checked })} />
                    bot is member
                  </label>
                </>
              )}
              {b.request === "poll" && (
                <select value={b.pollType} onChange={(e) => update(i, { pollType: e.target.value as KeyboardButtonDraft["pollType"] })} aria-label="Poll type" className={field}>
                  <option value="">Any poll</option>
                  <option value="regular">Regular</option>
                  <option value="quiz">Quiz</option>
                </select>
              )}
              {b.request === "web_app" && (
                <input
                  value={b.url}
                  onChange={(e) => update(i, { url: e.target.value })}
                  placeholder="https://… (Mini App)"
                  aria-label="Mini App URL"
                  className={`${field} min-w-0 flex-1`}
                />
              )}
              <button
                type="button"
                onClick={() => set({ buttons: draft.buttons.filter((_, j) => j !== i) })}
                aria-label="Remove keyboard button"
                className="text-[var(--muted)] hover:text-[var(--danger)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={draft.buttons.length >= MAX_BUTTONS}
            onClick={() => set({ buttons: [...draft.buttons, emptyKeyboardButton()] })}
          >
            <Plus className="h-3.5 w-3.5" />
            Add button
          </Button>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={draft.resize} onChange={(e) => set({ resize: e.target.checked })} />
              Fit height
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={draft.persistent} onChange={(e) => set({ persistent: e.target.checked })} />
              Always show
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={draft.oneTime} onChange={(e) => set({ oneTime: e.target.checked })} />
              Hide after one use
            </label>
          </div>
        </>
      )}
      {(draft.mode === "keyboard" || draft.mode === "force_reply") && (
        <input
          value={draft.placeholder}
          onChange={(e) => set({ placeholder: e.target.value })}
          placeholder="Input placeholder (optional)"
          maxLength={64}
          aria-label="Input placeholder"
          className={`${field} w-full`}
        />
      )}
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}
