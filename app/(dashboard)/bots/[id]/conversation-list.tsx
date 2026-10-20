"use client";

import { Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import { timeAgo } from "@/lib/time";
import { validateChatId } from "@/lib/validation";
import { cn } from "@/lib/utils";
import type { BotContact, BotConversation } from "./types";

interface ChatTarget {
  chatId: string;
  name: string;
  hint: string;
}

export function ConversationList({
  botId,
  photoVersion,
  conversations,
  contacts,
  selected,
  onSelect,
  className,
}: {
  botId: number;
  /** Bumped when a contact was refreshed so avatars refetch. */
  photoVersion: number;
  conversations: BotConversation[];
  contacts: BotContact[];
  selected: string | null;
  onSelect: (key: string) => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(false);

  const q = query.trim().toLowerCase();
  const visible = q
    ? conversations.filter((c) => c.name.toLowerCase().includes(q) || c.chatId.includes(q) || (c.connectionId !== null && "business".includes(q)))
    : conversations;

  return (
    <div className={cn("flex min-h-0 flex-col border-[var(--card-border)] md:border-r", className)}>
      <div className="flex items-center gap-2 p-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
          <Input
            placeholder="Search chats"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPicking((v) => !v)}
          aria-label="New chat"
          aria-expanded={picking}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {picking && (
        <NewChatPicker
          contacts={contacts}
          onPick={(chatId) => {
            setPicking(false);
            onSelect(chatId);
          }}
        />
      )}

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-[var(--muted)]">
            {conversations.length === 0 ? "No chats yet." : "No matches."}
          </li>
        )}
        {visible.map((c) => (
          <li key={c.key}>
            <button
              type="button"
              onClick={() => onSelect(c.key)}
              className={cn(
                "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5",
                selected === c.key && "bg-[var(--primary)]/10"
              )}
            >
              <Avatar
                src={c.connectionId ? null : `/api/bots/${botId}/contacts/${encodeURIComponent(c.chatId)}/photo?v=${photoVersion}`}
                name={c.name}
                className="h-9 w-9"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium">
                    {c.name}
                    {c.connectionId && <span className="ml-1.5 rounded bg-[var(--primary)]/15 px-1 py-0.5 align-middle text-[10px] font-medium text-[var(--primary)]">Business</span>}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--muted)]">{timeAgo(c.lastAt)}</span>
                </span>
                <span className="block truncate text-xs text-[var(--muted)]">{c.lastText || "(no messages)"}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewChatPicker({ contacts, onPick }: { contacts: BotContact[]; onPick: (chatId: string) => void }) {
  const [targets, setTargets] = useState<ChatTarget[]>(
    contacts.map((c) => ({ chatId: c.chatId, name: c.name, hint: "Wrote to this bot" }))
  );
  const [loadingChats, setLoadingChats] = useState(true);
  const [manual, setManual] = useState("");
  const manualError = manual ? validateChatId(manual) : null;

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ chats: { botApiId: string; title: string; kind: string }[] }>("/api/chats")
      .then(({ chats }) => {
        if (cancelled) return;
        setTargets((prev) => [
          ...prev,
          ...chats.map((c) => ({ chatId: c.botApiId, name: c.title, hint: `Your ${c.kind}` })),
        ]);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingChats(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-h-56 space-y-2 overflow-y-auto border-y border-[var(--card-border)] bg-black/[0.02] p-2 dark:bg-white/[0.03]">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual && !manualError) onPick(manual.trim());
        }}
      >
        <Input
          placeholder="Chat ID"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          className="h-9"
          aria-invalid={Boolean(manualError)}
        />
        <Button type="submit" size="sm" disabled={!manual || Boolean(manualError)}>
          Open
        </Button>
      </form>
      {manualError && <p className="text-xs text-[var(--danger)]">{manualError}</p>}
      <p className="px-1 text-[11px] text-[var(--muted)]">
        A bot can only message people who pressed Start on it, and channels/groups it was added to.
      </p>
      <ul>
        {targets.map((t) => (
          <li key={t.chatId}>
            <button
              type="button"
              onClick={() => onPick(t.chatId)}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
            >
              <span className="truncate">{t.name}</span>
              <span className="shrink-0 text-xs text-[var(--muted)]">{t.hint}</span>
            </button>
          </li>
        ))}
        {loadingChats && <li className="px-2 py-1.5 text-xs text-[var(--muted)]">Loading your channels…</li>}
      </ul>
    </div>
  );
}
