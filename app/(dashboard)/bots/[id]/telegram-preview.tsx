"use client";

import { AppWindow, Copy, ExternalLink, Menu, Paperclip, Search } from "lucide-react";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import type { InlineButton, ReplyKeyboard } from "@/lib/botapi";
import { fillSample, formatPreview, type FormatNode } from "@/lib/format-preview";
import type { BotCommand } from "./types";

export interface PreviewMessage {
  from: "bot" | "user";
  text: string;
  parseMode?: "HTML" | "MarkdownV2" | "" | null;
  buttons?: InlineButton[][] | null;
  /** A small pop-up answering a button press, shown over the chat instead of a bubble. */
  toast?: boolean;
}

export interface PreviewMenuButton {
  type: "default" | "commands" | "web_app";
  text?: string;
}

/**
 * A phone-style mock of how the bot looks in Telegram. Pure presentation: formatting is turned into React elements
 * (never HTML) and nothing in it is clickable, so whatever the user types can't run anything.
 */
export function TelegramPreview({
  botName,
  username,
  photoSrc,
  mode,
  description,
  shortDescription,
  messages = [],
  keyboard,
  menuButton,
  commands = [],
  showCommands = false,
  className = "",
}: {
  botName: string;
  username: string;
  photoSrc?: string | null;
  mode: "profile" | "chat";
  /** Profile mode: the "What can this bot do?" text and the short description under the name. */
  description?: string;
  shortDescription?: string;
  messages?: PreviewMessage[];
  keyboard?: ReplyKeyboard | null;
  menuButton?: PreviewMenuButton | null;
  commands?: BotCommand[];
  /** Chat mode: open the "/" command list above the input. */
  showCommands?: boolean;
  className?: string;
}) {
  const menuLabel = menuButton?.type === "web_app" ? menuButton.text || "Open" : "Menu";
  const placeholder = keyboard?.kind === "keyboard" || keyboard?.kind === "force_reply" ? keyboard.placeholder : undefined;

  return (
    <div
      className={`mx-auto flex w-full max-w-[320px] flex-col overflow-hidden rounded-[1.5rem] border-4 border-[var(--card-border)] bg-[var(--tg-wall)] text-[13px] text-[var(--tg-text)] shadow-sm ${className}`}
      role="img"
      aria-label={`Preview of @${username} in Telegram`}
    >
      <div className="flex items-center gap-2 bg-[var(--tg-bar)] px-3 py-2">
        <Avatar src={photoSrc} name={botName} className="h-8 w-8" textClassName="text-xs" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-semibold">{botName || `@${username}`}</p>
          <p className="text-[11px] text-[var(--tg-meta)]">bot</p>
        </div>
        <Search className="h-4 w-4 text-[var(--tg-meta)]" aria-hidden />
      </div>

      {mode === "profile" ? (
        <>
          <div className="flex min-h-[240px] flex-1 flex-col items-center gap-3 overflow-hidden p-4 text-center">
            <Avatar src={photoSrc} name={botName} className="h-16 w-16" textClassName="text-xl" />
            <div className="leading-tight">
              <p className="font-semibold">{botName || `@${username}`}</p>
              <p className="text-[11px] text-[var(--tg-meta)]">bot</p>
            </div>
            {shortDescription ? <p className="text-[var(--tg-meta)]">{shortDescription}</p> : null}
            <div className="w-full rounded-xl bg-[var(--tg-in)] p-3 text-left">
              <p className="mb-1 font-semibold">What can this bot do?</p>
              {description ? (
                <p className="whitespace-pre-wrap break-words">{description}</p>
              ) : (
                <p className="text-[var(--tg-meta)]">Your description appears here.</p>
              )}
            </div>
          </div>
          <div className="bg-[var(--tg-bar)] py-2.5 text-center text-xs font-semibold tracking-wide text-[var(--tg-link)]">START</div>
        </>
      ) : (
        <>
          <div className="flex max-h-[420px] min-h-[220px] flex-1 flex-col overflow-y-auto p-2">
            {/* mt-auto (not justify-end) so short chats sit at the bottom but a long one still scrolls from its first line. */}
            <div className="mt-auto flex flex-col gap-1.5">
              {messages.length === 0 && <p className="py-8 text-center text-[var(--tg-meta)]">Nothing to show yet.</p>}
              {messages.map((m, i) => (
                <Bubble key={i} message={m} commands={commands} />
              ))}
            </div>
          </div>
          {showCommands && commands.length > 0 && (
            <ul className="mx-2 mb-1 max-h-32 overflow-hidden rounded-xl bg-[var(--tg-bar)] py-1">
              {commands.slice(0, 5).map((c) => (
                <li key={c.command} className="flex gap-2 px-3 py-1">
                  <span className="font-medium text-[var(--tg-link)]">/{c.command}</span>
                  <span className="truncate text-[var(--tg-meta)]">{c.description}</span>
                </li>
              ))}
            </ul>
          )}
          {keyboard?.kind === "keyboard" && keyboard.rows.length > 0 && (
            <div className="space-y-1 bg-[var(--tg-bar)] p-1.5">
              {keyboard.rows.map((row, r) => (
                <div key={r} className="flex gap-1">
                  {row.map((b, c) => (
                    <div key={c} className="min-w-0 flex-1 truncate rounded-md bg-[var(--tg-in)] px-2 py-1.5 text-center shadow-sm">
                      {b.text}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {keyboard?.kind === "force_reply" && <div className="bg-[var(--tg-bar)] px-3 py-1.5 text-[11px] text-[var(--tg-link)]">Reply to the message above…</div>}
          <div className="flex items-center gap-2 bg-[var(--tg-bar)] px-2.5 py-2 text-[var(--tg-meta)]">
            {menuButton && menuButton.type !== "default" ? (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--tg-link)] px-2 py-1 text-[11px] font-medium text-white">
                {menuButton.type === "web_app" ? <AppWindow className="h-3 w-3" aria-hidden /> : <Menu className="h-3 w-3" aria-hidden />}
                <span className="max-w-[80px] truncate">{menuLabel}</span>
              </span>
            ) : (
              <Menu className="h-4 w-4 shrink-0" aria-hidden />
            )}
            <span className="min-w-0 flex-1 truncate">{placeholder || "Message"}</span>
            <Paperclip className="h-4 w-4 shrink-0" aria-hidden />
          </div>
        </>
      )}
    </div>
  );
}

function Bubble({ message, commands }: { message: PreviewMessage; commands: BotCommand[] }) {
  const text = fillSample(message.text, message.parseMode, commands);
  if (message.toast) {
    return <p className="mx-auto max-w-[85%] rounded-full bg-black/70 px-3 py-1.5 text-center text-xs text-white">{text}</p>;
  }
  const mine = message.from === "user";
  return (
    <div className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
      <div className={`max-w-[88%] rounded-2xl px-2.5 py-1.5 shadow-sm ${mine ? "bg-[var(--tg-out)]" : "bg-[var(--tg-in)]"}`}>
        <div className="whitespace-pre-wrap break-words">{renderNodes(formatPreview(text, message.parseMode))}</div>
      </div>
      {message.buttons?.length ? (
        <div className="w-full max-w-[88%] space-y-1">
          {message.buttons.map((row, r) => (
            <div key={r} className="flex gap-1">
              {row.map((b, c) => (
                <div
                  key={c}
                  className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg bg-[var(--tg-btn)] px-2 py-1.5 text-center text-xs font-medium text-white"
                >
                  <span className="truncate">{b.text || "…"}</span>
                  {b.url || b.login_url ? <ExternalLink className="h-3 w-3 shrink-0 opacity-80" aria-hidden /> : null}
                  {b.copy_text ? <Copy className="h-3 w-3 shrink-0 opacity-80" aria-hidden /> : null}
                  {b.web_app ? <AppWindow className="h-3 w-3 shrink-0 opacity-80" aria-hidden /> : null}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** FormatNode tree → React elements. Strings go through React's escaping, so nothing here can become markup. */
function renderNodes(nodes: FormatNode[], inPre = false): ReactNode {
  return nodes.map((node, i) => {
    if (typeof node === "string") return node;
    const children = renderNodes(node.children, inPre || node.tag === "pre");
    switch (node.tag) {
      case "b":
        return <strong key={i}>{children}</strong>;
      case "i":
        return <em key={i}>{children}</em>;
      case "u":
        return <u key={i}>{children}</u>;
      case "s":
        return <s key={i}>{children}</s>;
      case "code":
        return inPre ? <span key={i}>{children}</span> : <code key={i} className="rounded bg-black/10 px-1 font-mono text-[12px]">{children}</code>;
      case "pre":
        return <pre key={i} className="my-0.5 overflow-x-auto whitespace-pre-wrap rounded bg-black/10 p-1.5 font-mono text-[12px]">{children}</pre>;
      case "a":
        return <span key={i} className="text-[var(--tg-link)]">{children}</span>;
      case "spoiler":
        return <span key={i} className="rounded bg-[var(--tg-meta)] text-transparent select-none" title="Hidden until tapped">{children}</span>;
      case "quote":
        return <blockquote key={i} className="my-0.5 border-l-2 border-[var(--tg-link)] pl-2">{children}</blockquote>;
    }
  });
}
