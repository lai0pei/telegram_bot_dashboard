import { CornerUpLeft, CornerUpRight, FileText, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { memo, useState } from "react";
import { fadeUp, spring } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { validateCaption, validateMessageText } from "@/lib/validation";
import type { BotMessageRow, ParseModeChoice } from "./types";

export interface MessageActions {
  onDelete: (message: BotMessageRow) => void;
  onReply: (message: BotMessageRow) => void;
  onEdit: (message: BotMessageRow, text: string, parseMode: ParseModeChoice) => Promise<boolean>;
  onPin: (message: BotMessageRow) => void;
  onForward: (message: BotMessageRow) => void;
  onStopPoll: (message: BotMessageRow) => void;
}

function Media({ message, botId }: { message: BotMessageRow; botId: number }) {
  const src = `/api/bots/${botId}/messages/${message.id}/media`;
  switch (message.mediaType) {
    case null:
    case "poll":
      return null;
    case "photo":
      return (
        <a href={src} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated media from our own API */}
          <img src={src} alt="" loading="lazy" className="mb-1 max-h-64 rounded-lg object-contain" />
        </a>
      );
    case "video":
      return <video src={src} controls preload="none" className="mb-1 max-h-64 rounded-lg" />;
    case "audio":
    case "voice":
      return <audio src={src} controls preload="none" className="mb-1 max-w-full" />;
    default:
      return (
        <a
          href={src}
          download
          className="mb-1 flex items-center gap-2 rounded-lg bg-black/5 px-2 py-1.5 text-xs hover:underline dark:bg-white/10"
        >
          <FileText className="h-4 w-4 shrink-0" />
          {message.mediaType === "sticker" ? "Sticker" : "Download file"}
        </a>
      );
  }
}

/** A poll's options with vote counts; the correct answer of a quiz is marked once Telegram reports it. */
function PollView({ poll, onStop }: { poll: NonNullable<BotMessageRow["poll"]>; onStop?: () => void }) {
  const total = poll.total_voter_count;
  return (
    <div className="min-w-56 space-y-1.5">
      <p className="font-medium">📊 {poll.question}</p>
      <p className="text-xs text-[var(--muted)]">
        {poll.type === "quiz" ? "Quiz" : "Poll"} · {poll.is_anonymous ? "anonymous" : "public"} · {poll.is_closed ? "closed" : "open"}
      </p>
      <ul className="space-y-1">
        {poll.options.map((o, i) => {
          const share = total ? (o.voter_count / total) * 100 : 0;
          return (
            <li key={i} className="space-y-0.5">
              <div className="flex justify-between gap-3 text-xs">
                <span>
                  {poll.correct_option_id === i ? "✓ " : ""}
                  {o.text}
                </span>
                <span className="tabular-nums text-[var(--muted)]">
                  {o.voter_count} ({Math.round(share)}%)
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${share}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
        <span>
          {total} vote{total === 1 ? "" : "s"}
        </span>
        {onStop && !poll.is_closed && (
          <Button type="button" size="sm" variant="outline" onClick={onStop}>
            Stop poll
          </Button>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-6 w-6 items-center justify-center rounded text-[var(--muted)] transition-colors ${
        danger ? "hover:text-[var(--danger)]" : "hover:text-[var(--foreground)]"
      }`}
    >
      {children}
    </button>
  );
}

export const MessageRow = memo(function MessageRow({
  message,
  botId,
  replyTarget,
  actions,
}: {
  message: BotMessageRow;
  botId: number;
  /** The message this one replies to, when it is in the loaded list. */
  replyTarget?: BotMessageRow;
  actions: MessageActions;
}) {
  const isIncoming = message.direction === "in";
  // Edit, pin, forward and poll calls need the chat of the bot itself; they don't exist for a business chat.
  const isBusiness = Boolean(message.businessConnectionId);
  const canEdit = !isBusiness && !isIncoming && message.telegramMessageId != null && message.mediaType !== "sticker" && message.mediaType !== "other" && message.mediaType !== "poll";
  const canAct = message.telegramMessageId != null;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text ?? "");
  const [parseMode, setParseMode] = useState<ParseModeChoice>("");
  const [saving, setSaving] = useState(false);
  const draftError = editing ? (message.mediaType ? validateCaption(draft) : validateMessageText(draft)) : null;

  async function save() {
    if (draftError || saving) return;
    setSaving(true);
    const ok = await actions.onEdit(message, draft, parseMode);
    setSaving(false);
    if (ok) setEditing(false);
  }

  return (
    <motion.div
      layout
      initial={fadeUp.initial}
      animate={fadeUp.animate}
      exit={fadeUp.exit}
      transition={spring}
      className={`group flex max-w-[85%] items-start gap-1 ${isIncoming ? "mr-auto" : "ml-auto flex-row-reverse"}`}
    >
      <div
        className={`min-w-0 rounded-2xl px-3 py-2 text-sm ${
          isIncoming ? "rounded-bl-sm bg-black/5 dark:bg-white/10" : "rounded-br-sm bg-[var(--primary)]/15"
        }`}
      >
        {message.replyToMessageId != null && (
          <div className="mb-1 truncate border-l-2 border-[var(--primary)] pl-2 text-xs text-[var(--muted)]">
            {replyTarget ? replyTarget.text || "(media)" : "Replied to an earlier message"}
          </div>
        )}
        <Media message={message} botId={botId} />
        {editing ? (
          <div className="space-y-1.5">
            <Textarea
              className="min-w-48"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={message.mediaType ? 1024 : 4096}
              aria-invalid={Boolean(draftError)}
            />
            {draftError && <p className="text-xs text-[var(--danger)]">{draftError}</p>}
            <div className="flex items-center gap-1.5">
              <select
                value={parseMode}
                onChange={(e) => setParseMode(e.target.value as ParseModeChoice)}
                aria-label="Format"
                className="h-8 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-2 text-xs"
              >
                <option value="">Plain</option>
                <option value="HTML">HTML</option>
                <option value="MarkdownV2">MarkdownV2</option>
              </select>
              <Button type="button" size="sm" loading={saving} disabled={Boolean(draftError)} onClick={() => void save()}>
                Save
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : message.poll ? (
          <PollView poll={message.poll} onStop={!isIncoming && canAct && !isBusiness ? () => actions.onStopPoll(message) : undefined} />
        ) : (
          (message.text || !message.mediaType) && (
            <div className="whitespace-pre-wrap break-words">{message.text || "(non-text message)"}</div>
          )
        )}
        <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-[var(--muted)]">
          {message.pinned && <Pin className="h-3 w-3" aria-label="Pinned" />}
          {message.editedAt && <span>edited</span>}
          {message.deletedAt && <span title="Telegram reported this message deleted in the business chat">deleted in Telegram ·</span>}
          <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </div>
      {!editing && (
        <div className="mt-1 flex shrink-0 flex-col opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <div className="flex">
            {canAct && (
              <ActionButton label="Reply" onClick={() => actions.onReply(message)}>
                <CornerUpLeft className="h-3.5 w-3.5" />
              </ActionButton>
            )}
            {canEdit && (
              <ActionButton
                label="Edit"
                onClick={() => {
                  setDraft(message.text ?? "");
                  setEditing(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </ActionButton>
            )}
          </div>
          <div className="flex">
            {canAct && !isBusiness && (
              <ActionButton label={message.pinned ? "Unpin" : "Pin"} onClick={() => actions.onPin(message)}>
                {message.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              </ActionButton>
            )}
            {canAct && !isBusiness && (
              <ActionButton label="Forward" onClick={() => actions.onForward(message)}>
                <CornerUpRight className="h-3.5 w-3.5" />
              </ActionButton>
            )}
            <ActionButton label="Delete message" danger onClick={() => actions.onDelete(message)}>
              <Trash2 className="h-3.5 w-3.5" />
            </ActionButton>
          </div>
        </div>
      )}
    </motion.div>
  );
});
