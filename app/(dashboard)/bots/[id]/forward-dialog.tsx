"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { validateChatId } from "@/lib/validation";
import type { BotContact, BotConversation, BotMessageRow } from "./types";

/** Pick where to forward or copy a message: a known conversation/contact, or a chat ID. */
export function ForwardDialog({
  message,
  conversations,
  contacts,
  busy,
  onClose,
  onForward,
}: {
  message: BotMessageRow | null;
  conversations: BotConversation[];
  contacts: BotContact[];
  busy: boolean;
  onClose: () => void;
  onForward: (message: BotMessageRow, toChatId: string, copy: boolean) => void;
}) {
  const [manual, setManual] = useState("");
  const [copy, setCopy] = useState(false);
  const manualError = manual ? validateChatId(manual) : null;

  const targets = new Map<string, string>();
  for (const c of conversations) targets.set(c.chatId, c.name);
  for (const c of contacts) if (!targets.has(c.chatId)) targets.set(c.chatId, c.name);

  return (
    <Dialog open={message !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>Forward message</DialogTitle>
        <DialogDescription>
          Choose a chat. &ldquo;Copy&rdquo; sends it as a new message without the &ldquo;forwarded from&rdquo; header.
        </DialogDescription>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
          Send as a copy
        </label>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {[...targets].map(([chatId, name]) => (
            <li key={chatId}>
              <button
                type="button"
                disabled={busy || !message}
                onClick={() => message && onForward(message, chatId, copy)}
                className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/5"
              >
                <span className="truncate">{name}</span>
                <span className="shrink-0 font-mono text-xs text-[var(--muted)]">{chatId}</span>
              </button>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (message && manual && !manualError) onForward(message, manual.trim(), copy);
          }}
        >
          <Input placeholder="Or a chat ID" value={manual} onChange={(e) => setManual(e.target.value)} aria-invalid={Boolean(manualError)} />
          <Button type="submit" loading={busy} disabled={!manual || Boolean(manualError)}>
            Send
          </Button>
        </form>
        {manualError && <p className="text-xs text-[var(--danger)]">{manualError}</p>}
      </DialogContent>
    </Dialog>
  );
}
