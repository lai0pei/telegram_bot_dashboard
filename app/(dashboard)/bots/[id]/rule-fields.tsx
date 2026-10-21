"use client";

import { useRef } from "react";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TEMPLATE_PLACEHOLDERS, type TemplatePlaceholder } from "@/lib/templates";
import { MEDIA_KINDS } from "@/lib/validation";
import { AttachmentField, FollowUpsEditor } from "./attachment-editor";
import { ConditionsEditor } from "./conditions-editor";
import { ButtonsEditor } from "./buttons-editor";
import { KeyboardEditor } from "./keyboard-editor";
import { draftError, draftOutputs, isCallbackType, isToastOnly, type RuleDraft } from "./rule-draft";
import type { AutoReplyMatchType, BotDetail, CallbackAction, ParseModeChoice } from "./types";

/** Plain-language names for the stored match types (the stored values are unchanged). */
export const MATCH_TYPES: { value: AutoReplyMatchType; label: string; patternLabel: string; patternHint: string }[] = [
  { value: "command", label: "Someone sends a command", patternLabel: "Command", patternHint: "start (without the slash)" },
  { value: "exact", label: "Someone writes exactly…", patternLabel: "Their message", patternHint: "hello" },
  { value: "contains", label: "Someone's message contains…", patternLabel: "Word or phrase", patternHint: "price" },
  { value: "starts_with", label: "Someone's message starts with…", patternLabel: "Starts with", patternHint: "e.g. buy " },
  { value: "regex", label: "Someone's message matches a pattern", patternLabel: "Pattern (regular expression)", patternHint: "^order #\\d+$" },
  { value: "callback", label: "Someone presses a button", patternLabel: "Button ID", patternHint: "the button's hidden ID, e.g. about" },
  { value: "callback_prefix", label: "Someone presses a button (ID starts with…)", patternLabel: "Button ID starts with", patternHint: "e.g. page:" },
  { value: "deeplink", label: "Someone opens a special link", patternLabel: "Link code", patternHint: "the code after ?start=, e.g. promo_2026" },
  { value: "media", label: "Someone sends a photo, file…", patternLabel: "Kind of message", patternHint: "" },
  { value: "shared", label: "Someone shares a contact or chat", patternLabel: "Request ID", patternHint: "the request ID of the keyboard button, e.g. 1" },
  { value: "fallback", label: "Anything else (nothing above matches)", patternLabel: "Matches", patternHint: "" },
  { value: "member_joined", label: "Someone joins a group", patternLabel: "Matches", patternHint: "" },
  { value: "reaction", label: "Someone reacts to a bot message", patternLabel: "Reaction", patternHint: "👍 — or * for any" },
];

export const CALLBACK_ACTION_LABELS: Record<CallbackAction, string> = {
  toast: "Show a small pop-up",
  edit: "Replace the message (for menus)",
  reply: "Send a new message",
};

const PARSE_MODE_LABELS: Record<ParseModeChoice, string> = { "": "Plain text", HTML: "Formatted (HTML)", MarkdownV2: "Formatted (Markdown)" };

const PLACEHOLDER_HELP: Record<TemplatePlaceholder, string> = {
  first_name: "Their first name",
  last_name: "Their last name",
  username: "Their @username",
  user_id: "Their Telegram ID",
  payload: "The code from a special link",
  commands: "The list of your commands",
};

const select = "h-10 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 text-sm";

/** The fields of one auto-reply rule: when it fires, what it answers, and the buttons or keyboard that come with it. */
export function RuleFields({ bot, draft, onChange, idPrefix = "rule" }: { bot: BotDetail; draft: RuleDraft; onChange: (draft: RuleDraft) => void; idPrefix?: string }) {
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const set = (patch: Partial<RuleDraft>) => onChange({ ...draft, ...patch });
  const { matchType, callbackAction } = draft;
  const toastOnly = isToastOnly(draft);
  const editsMessage = isCallbackType(matchType) && callbackAction === "edit";
  const { buttons } = draftOutputs(draft);
  const meta = MATCH_TYPES.find((t) => t.value === matchType);

  function insertPlaceholder(name: string) {
    const el = replyRef.current;
    const token = `{${name}}`;
    const start = el?.selectionStart ?? draft.replyText.length;
    const end = el?.selectionEnd ?? start;
    set({ replyText: draft.replyText.slice(0, start) + token + draft.replyText.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-type`}>When</Label>
          <select
            id={`${idPrefix}-type`}
            className={`${select} w-full`}
            // Both button-press types read as one choice; "ID starts with…" is the advanced toggle below.
            value={matchType === "callback_prefix" ? "callback" : matchType}
            onChange={(e) => {
              const next = e.target.value as AutoReplyMatchType;
              // The pattern's meaning changes with the type (a media kind is picked from a list), so start afresh.
              set({ matchType: next, pattern: next === "media" ? MEDIA_KINDS[0] : next === "fallback" || next === "member_joined" ? "*" : next === "reaction" ? "👍" : "" });
            }}
          >
            {MATCH_TYPES.filter((t) => t.value !== "callback_prefix").map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-pattern`}>{meta?.patternLabel ?? "Pattern"}</Label>
          {matchType === "media" ? (
            <select id={`${idPrefix}-pattern`} className={`${select} w-full`} value={draft.pattern} onChange={(e) => set({ pattern: e.target.value })}>
              {MEDIA_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k.replace("_", " ")}
                </option>
              ))}
            </select>
          ) : matchType === "fallback" || matchType === "member_joined" ? (
            <p id={`${idPrefix}-pattern`} className="flex h-10 items-center text-sm text-[var(--muted)]">
              {matchType === "fallback" ? "Every private message no other rule answers" : "Every person who joins (bots are ignored)"}
            </p>
          ) : (
            <Input id={`${idPrefix}-pattern`} value={draft.pattern} onChange={(e) => set({ pattern: e.target.value })} placeholder={meta?.patternHint} />
          )}
        </div>
      </div>

      {isCallbackType(matchType) && (
        <>
          <div className="flex items-center gap-2">
            <Label htmlFor={`${idPrefix}-action`} className="shrink-0">
              Then
            </Label>
            <select id={`${idPrefix}-action`} className={select} value={callbackAction} onChange={(e) => set({ callbackAction: e.target.value as CallbackAction })}>
              {(Object.keys(CALLBACK_ACTION_LABELS) as CallbackAction[]).map((a) => (
                <option key={a} value={a}>
                  {CALLBACK_ACTION_LABELS[a]}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <input type="checkbox" checked={matchType === "callback_prefix"} onChange={(e) => set({ matchType: e.target.checked ? "callback_prefix" : "callback" })} />
            Advanced: also match every button ID that starts with this
          </label>
        </>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-reply`}>
          {toastOnly ? "Pop-up text" : editsMessage ? "New text of the message" : draft.media ? (draft.media.kind === "sticker" ? "Text (a sticker can't have any)" : "Caption") : "Reply"}
        </Label>
        <Textarea
          id={`${idPrefix}-reply`}
          ref={replyRef}
          value={draft.replyText}
          onChange={(e) => set({ replyText: e.target.value })}
          maxLength={toastOnly ? 200 : draft.media ? 1024 : 4096}
        />
      </div>
      {!toastOnly && !editsMessage && (
        <div className="space-y-1.5">
          <Label>Attach a photo or file (optional)</Label>
          <AttachmentField botId={bot.id} media={draft.media} onChange={(media) => set({ media })} idPrefix={`${idPrefix}-attach`} />
        </div>
      )}
      {!toastOnly && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]">
          <span>Insert:</span>
          {TEMPLATE_PLACEHOLDERS.map((p) => (
            <button
              key={p}
              type="button"
              title={PLACEHOLDER_HELP[p]}
              onClick={() => insertPlaceholder(p)}
              className="rounded-full border border-[var(--card-border)] px-2 py-0.5 hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              {PLACEHOLDER_HELP[p]}
            </button>
          ))}
        </div>
      )}

      {toastOnly ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.showAlert} onChange={(e) => set({ showAlert: e.target.checked })} />
          Show it as a pop-up with an OK button instead of a short message
        </label>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Label htmlFor={`${idPrefix}-format`} className="shrink-0">
              Text style
            </Label>
            <select id={`${idPrefix}-format`} className={select} value={draft.parseMode} onChange={(e) => set({ parseMode: e.target.value as ParseModeChoice })}>
              {(Object.keys(PARSE_MODE_LABELS) as ParseModeChoice[]).map((m) => (
                <option key={m} value={m}>
                  {PARSE_MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <ButtonsEditor drafts={draft.buttons} onChange={(next) => set({ buttons: next })} botId={bot.id} inlineMode={bot.info?.supports_inline_queries} />
          {!editsMessage && (
            <KeyboardEditor
              draft={draft.keyboard}
              onChange={(next) => set({ keyboard: next })}
              disabledReason={buttons ? "Remove the buttons under the message to use a keyboard instead (a message can have only one)." : null}
            />
          )}
        </>
      )}

      {!toastOnly && !editsMessage && (
        <FollowUpsEditor botId={bot.id} items={draft.followUps} onChange={(followUps) => set({ followUps })} idPrefix={`${idPrefix}-more`} />
      )}

      {!isCallbackType(matchType) && <ConditionsEditor matchType={matchType} value={draft.conditions} onChange={(conditions) => set({ conditions })} idPrefix={`${idPrefix}-when`} />}

      {(matchType === "exact" || matchType === "contains" || matchType === "starts_with") && (
        <p className="text-xs text-[var(--muted)]">Upper/lower case doesn&apos;t matter, and the first matching rule wins. Private chats only unless you change it under &ldquo;When it applies&rdquo;.</p>
      )}
      {matchType === "regex" && (
        <p className="text-xs text-[var(--muted)]">
          A regular expression, upper/lower case ignored, tested on the first 1000 characters. Patterns that could make the bot hang (such as <code>(a+)+</code>), look-ahead and
          back-references are refused.
        </p>
      )}
      {matchType === "member_joined" && (
        <p className="text-xs text-[var(--muted)]">
          Sent in the group when someone joins, with {"{first_name}"} and the other placeholders filled in for the new member. Works in groups the bot is in; no admin rights needed.
        </p>
      )}
      {matchType === "reaction" && (
        <p className="text-xs text-[var(--muted)]">
          Only reactions to messages this bot sent. Private chats work as is; in groups Telegram only tells the bot about reactions when it is an admin there, and you must set
          &ldquo;Where&rdquo; to groups. Not available in the test chat.
        </p>
      )}
      {matchType === "deeplink" && (
        <p className="text-xs text-[var(--muted)]">
          Answers links like t.me/{bot.username}?start=<em>code</em>. The code is case-sensitive, and it takes priority over a plain /start rule.
        </p>
      )}
      {(matchType === "media" || matchType === "shared") && (
        <p className="text-xs text-[var(--muted)]">Only works in private chats. &ldquo;Shares a contact or chat&rdquo; comes from a keyboard button that asks the person to pick one.</p>
      )}
      <FieldError error={draftError(draft)} />
    </div>
  );
}
