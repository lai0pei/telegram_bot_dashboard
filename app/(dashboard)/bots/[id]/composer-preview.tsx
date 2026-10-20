"use client";

import { TEMPLATE_PLACEHOLDERS } from "@/lib/templates";
import { draftsToButtons, type ButtonDraft } from "./buttons-editor";
import { TelegramPreview, type PreviewMessage } from "./telegram-preview";
import type { BotDetail, ParseModeChoice } from "./types";
import type { ReplyKeyboard } from "@/lib/botapi";

/** True when the text holds a `{first_name}`-style placeholder, which only automatic replies fill in. */
export function usesPlaceholders(text: string): boolean {
  return TEMPLATE_PLACEHOLDERS.some((p) => text.includes(`{${p}}`));
}

/**
 * "How it will look" under a message composer. Broadcasts, scheduled messages and chat messages are sent exactly as
 * typed (no `{placeholders}`), so the preview does not fill them either, and says so when it matters.
 */
/** What the preview needs of a bot (the chat pane only has its ID otherwise). */
export type PreviewBot = Pick<BotDetail, "id" | "name" | "firstName" | "username">;

export function ComposerPreview({
  bot,
  text,
  parseMode,
  drafts = [],
  media,
  keyboard,
  title = "How it will look",
  className = "",
}: {
  bot: PreviewBot;
  text: string;
  parseMode: ParseModeChoice;
  drafts?: ButtonDraft[];
  media?: PreviewMessage["media"];
  keyboard?: ReplyKeyboard | null;
  title?: string;
  className?: string;
}) {
  const message: PreviewMessage = {
    from: "bot",
    text: text || (media ? "" : "Your message appears here."),
    parseMode,
    buttons: draftsToButtons(drafts),
    media,
  };
  return (
    <div className={className}>
      <p className="mb-2 text-xs font-medium text-[var(--muted)]">{title}</p>
      <TelegramPreview
        mode="chat"
        botName={bot.name ?? bot.firstName}
        username={bot.username}
        photoSrc={`/api/bots/${bot.id}/photo`}
        messages={[message]}
        keyboard={keyboard}
        fill={false}
        className="max-w-[300px]"
      />
      {usesPlaceholders(text) && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          Words in {"{braces}"}, like {"{first_name}"}, are sent exactly as typed here. Only automatic replies fill them in.
        </p>
      )}
    </div>
  );
}
