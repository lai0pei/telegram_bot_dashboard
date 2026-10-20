"use client";

import { ArrowLeft, BarChart3, Keyboard, Link2, Paperclip, Plus, RefreshCw, Send, Trash2, X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  MAX_BOT_FILE_BYTES,
  validateBotUpload,
  validateCaption,
  validateMessageText,
} from "@/lib/validation";
import { cn } from "@/lib/utils";
import type { BotMessageRow, ParseModeChoice, SendPayload } from "./types";
import { MessageRow, type MessageActions } from "./message-row";
import { PollDialog } from "./poll-dialog";
import { ButtonsEditor, draftsError, draftsToButtons, emptyButtonDraft, type ButtonDraft } from "./buttons-editor";
import { apiFetch } from "@/lib/api-client";
import { isPrivateChatId } from "@/lib/botapi";
import type { MessageEffect } from "@/lib/effects";
import { KeyboardEditor, draftToReplyKeyboard, emptyKeyboardDraft, keyboardDraftError, type KeyboardDraft } from "./keyboard-editor";

const NEAR_BOTTOM_PX = 80;
const TYPING_THROTTLE_MS = 5000;

export function ChatPane({
  botId,
  photoVersion,
  refreshing,
  onRefreshContact,
  chatId,
  businessConnectionId,
  name,
  messages,
  sending,
  monitorEnabled,
  clearing,
  onSend,
  onTyping,
  messageActions,
  onClear,
  onBack,
  onPollSent,
  className,
}: {
  botId: number;
  photoVersion: number;
  refreshing: boolean;
  onRefreshContact: () => void;
  chatId: string;
  /** Set when this is a Telegram Business chat: replies go out through that connection. */
  businessConnectionId?: string;
  name: string;
  messages: BotMessageRow[];
  sending: boolean;
  monitorEnabled: boolean;
  clearing: boolean;
  onSend: (payload: SendPayload) => Promise<boolean>;
  onTyping: () => void;
  /** Reply is handled here (it only pre-fills the composer); the rest are the messages tab's. */
  messageActions: Omit<MessageActions, "onReply">;
  onClear: () => void;
  onBack: () => void;
  /** A poll was sent through the dialog: reload the conversation. */
  onPollSent: () => void;
  className?: string;
}) {
  const [text, setText] = useState("");
  const [parseMode, setParseMode] = useState<ParseModeChoice>("");
  const [replyingTo, setReplyingTo] = useState<BotMessageRow | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [asFile, setAsFile] = useState(false);
  const [buttonDrafts, setButtonDrafts] = useState<ButtonDraft[]>([]);
  const [showButtons, setShowButtons] = useState(false);
  const [keyboardDraft, setKeyboardDraft] = useState<KeyboardDraft>(emptyKeyboardDraft);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [effects, setEffects] = useState<MessageEffect[]>([]);
  const [effectId, setEffectId] = useState("");
  const privateChat = isPrivateChatId(chatId);

  // Effects only exist in private chats; the list comes from Telegram (cached server-side) and may be empty.
  useEffect(() => {
    if (!privateChat) return;
    apiFetch<{ effects: MessageEffect[] }>("/api/effects")
      .then((r) => setEffects(r.effects))
      .catch(() => {});
  }, [privateChat]);
  const [pollOpen, setPollOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastTypingAt = useRef(0);

  const buttons = draftsToButtons(buttonDrafts);
  const buttonsError = draftsError(buttonDrafts, businessConnectionId ? "-1" : chatId);
  const replyKeyboard = draftToReplyKeyboard(keyboardDraft);
  const keyboardError =
    keyboardDraftError(keyboardDraft, chatId) ??
    (replyKeyboard && file ? "A reply keyboard can only go with a text message, not a file." : null) ??
    (replyKeyboard && buttons ? "Use inline buttons or a reply keyboard, not both." : null);
  const textError = file ? validateCaption(text) : text ? validateMessageText(text) : null;
  const canSend = (file ? true : Boolean(text.trim())) && !textError && !buttonsError && !keyboardError && !sending;

  const actions = useMemo<MessageActions>(() => ({ ...messageActions, onReply: setReplyingTo }), [messageActions]);
  const byTelegramId = useMemo(() => {
    const map = new Map<number, BotMessageRow>();
    for (const m of messages) if (m.telegramMessageId != null) map.set(m.telegramMessageId, m);
    return map;
  }, [messages]);

  // The parent keys this component by chat, so a new chat starts at the bottom; afterwards only follow new messages if already there.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function handleTextChange(value: string) {
    setText(value);
    const now = Date.now();
    if (value && now - lastTypingAt.current > TYPING_THROTTLE_MS) {
      lastTypingAt.current = now;
      onTyping();
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    const error = validateBotUpload(picked);
    if (error) {
      toast.error(error);
      return;
    }
    setFile(picked);
    setAsFile(false);
  }

  async function submit() {
    if (!canSend) return;
    stickToBottom.current = true;
    const payload: SendPayload = {
      text,
      parseMode,
      replyTo: replyingTo?.telegramMessageId ?? undefined,
      buttons,
      replyKeyboard,
      effectId: privateChat && effectId && !businessConnectionId ? effectId : undefined,
      businessConnectionId,
      file: file ?? undefined,
      asFile: file ? asFile : undefined,
    };
    if (await onSend(payload)) {
      setText("");
      setReplyingTo(null);
      setFile(null);
      setAsFile(false);
      setButtonDrafts([]);
      setShowButtons(false);
      setKeyboardDraft(emptyKeyboardDraft());
      setShowKeyboard(false);
      setEffectId("");
    }
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-center gap-2 border-b border-[var(--card-border)] px-3 py-2">
        <Button type="button" variant="ghost" size="icon" className="md:hidden" onClick={onBack} aria-label="Back to chats">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Avatar
          src={businessConnectionId ? null : `/api/bots/${botId}/contacts/${encodeURIComponent(chatId)}/photo?v=${photoVersion}`}
          name={name}
          className="h-9 w-9"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{name}</div>
          <div className="flex items-center gap-1 font-mono text-xs text-[var(--muted)]">
            {chatId}
            <CopyButton value={chatId} />
            {businessConnectionId && <span className="ml-1 rounded bg-[var(--primary)]/15 px-1 py-0.5 font-sans text-[10px] font-medium text-[var(--primary)]">Business chat</span>}
          </div>
        </div>
        {!businessConnectionId && (
  <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRefreshContact}
            disabled={refreshing}
            aria-label="Refresh contact"
            title="Re-read this contact's name and photo from Telegram"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          </Button>
        )}
        {confirmClear ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="danger"
              size="sm"
              loading={clearing}
              onClick={() => {
                setConfirmClear(false);
                onClear();
              }}
            >
              Clear chat
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirmClear(true)}
            disabled={messages.length === 0}
            title="Removes this conversation from the dashboard only"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
        }}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3"
      >
        {messages.length === 0 ? (
          <p className="m-auto text-sm text-[var(--muted)]">No messages in this chat yet.</p>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <MessageRow
                key={m.id}
                message={m}
                botId={botId}
                replyTarget={m.replyToMessageId != null ? byTelegramId.get(m.replyToMessageId) : undefined}
                actions={actions}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      {!monitorEnabled && (
        <p className="border-t border-[var(--card-border)] px-3 py-1.5 text-xs text-[var(--muted)]">
          Monitoring is off, so the user&apos;s replies won&apos;t appear here.
        </p>
      )}

      {replyingTo && (
        <div className="flex items-center gap-2 border-t border-[var(--card-border)] px-3 py-1.5 text-xs">
          <span className="min-w-0 flex-1 truncate border-l-2 border-[var(--primary)] pl-2 text-[var(--muted)]">
            Replying to: {replyingTo.text || "(media)"}
          </span>
          <button type="button" onClick={() => setReplyingTo(null)} aria-label="Cancel reply" className="text-[var(--muted)] hover:text-[var(--foreground)]">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {file && (
        <div className="flex items-center gap-2 border-t border-[var(--card-border)] px-3 py-1.5 text-xs">
          <Paperclip className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
          </span>
          {file.type.startsWith("image/") && (
            <label className="flex items-center gap-1 text-[var(--muted)]">
              <input type="checkbox" checked={asFile} onChange={(e) => setAsFile(e.target.checked)} />
              Send as file
            </label>
          )}
          <button type="button" onClick={() => setFile(null)} aria-label="Remove attachment" className="text-[var(--muted)] hover:text-[var(--foreground)]">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {showButtons && (
        <div className="border-t border-[var(--card-border)] px-3 py-2">
          <ButtonsEditor drafts={buttonDrafts} onChange={setButtonDrafts} botId={botId} chatId={businessConnectionId ? "-1" : chatId} business={Boolean(businessConnectionId)} />
        </div>
      )}

      {showKeyboard && !businessConnectionId && (
        <div className="border-t border-[var(--card-border)] px-3 py-2">
          <KeyboardEditor
            draft={keyboardDraft}
            onChange={setKeyboardDraft}
            chatId={chatId}
            disabledReason={buttons ? "Remove the inline buttons to use a reply keyboard." : file ? "Remove the attachment to use a reply keyboard." : null}
          />
          {keyboardError && !keyboardDraftError(keyboardDraft, chatId) && <p className="mt-1 text-xs text-[var(--danger)]">{keyboardError}</p>}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex items-end gap-2 border-t border-[var(--card-border)] p-2"
      >
        <input ref={fileInput} type="file" className="hidden" onChange={handleFile} aria-label={`Attach a file (up to ${MAX_BOT_FILE_BYTES / 1024 / 1024} MB)`} />
        <Button type="button" variant="ghost" size="icon" onClick={() => fileInput.current?.click()} aria-label="Attach a file" title="Attach a file (up to 50 MB)">
          <Paperclip className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={showButtons ? "outline" : "ghost"}
          size="icon"
          onClick={() => {
            setShowButtons((v) => !v);
            if (!buttonDrafts.length) setButtonDrafts([emptyButtonDraft()]);
          }}
          aria-label="Inline buttons"
          aria-expanded={showButtons}
          title="Add link or callback buttons under the message"
        >
          <Link2 className="h-4 w-4" />
        </Button>
        {!businessConnectionId && (
        <Button
          type="button"
          variant={showKeyboard ? "outline" : "ghost"}
          size="icon"
          onClick={() => setShowKeyboard((v) => !v)}
          aria-label="Reply keyboard"
          aria-expanded={showKeyboard}
          title="Show, remove or force a reply keyboard with this message"
        >
          <Keyboard className="h-4 w-4" />
        </Button>
        )}
        {!businessConnectionId && (
        <Button type="button" variant="ghost" size="icon" onClick={() => setPollOpen(true)} aria-label="Send a poll" title="Send a poll or quiz">
          <BarChart3 className="h-4 w-4" />
        </Button>
        )}
        {privateChat && !businessConnectionId && effects.length > 0 && (
          <select
            value={effectId}
            onChange={(e) => setEffectId(e.target.value)}
            aria-label="Message effect"
            title="Play an animation behind this message"
            className="h-9 w-14 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-1 text-center text-sm"
          >
            <option value="">✨</option>
            {effects.map((e) => (
              <option key={e.id} value={e.id}>
                {e.emoji}
                {e.premiumRequired ? " (Premium)" : ""}
              </option>
            ))}
          </select>
        )}
        <select
          value={parseMode}
          onChange={(e) => setParseMode(e.target.value as ParseModeChoice)}
          aria-label="Format"
          title="Message format"
          className="h-10 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-2 text-xs"
        >
          <option value="">Plain</option>
          <option value="HTML">HTML</option>
          <option value="MarkdownV2">MarkdownV2</option>
        </select>
        <textarea
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={1}
          maxLength={file ? 1024 : 4096}
          placeholder={file ? "Caption (optional)" : "Message (Enter to send, Shift+Enter for a new line)"}
          aria-invalid={Boolean(textError)}
          className="max-h-32 min-h-10 min-w-0 flex-1 resize-none rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm outline-none transition-colors placeholder:text-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
        />
        <Button type="submit" loading={sending} disabled={!canSend}>
          <Send className="h-3.5 w-3.5" />
          Send
        </Button>
      </form>
      <PollDialog botId={botId} chatId={chatId} open={pollOpen} onClose={() => setPollOpen(false)} onSent={onPollSent} />
    </div>
  );
}
