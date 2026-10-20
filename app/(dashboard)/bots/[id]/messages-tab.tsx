"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { BotContact, BotConversation, BotDetail, BotMessageRow, ParseModeChoice, SendPayload } from "./types";
import { ChatPane } from "./chat-pane";
import { ConversationList } from "./conversation-list";
import { ForwardDialog } from "./forward-dialog";

const POLL_INTERVAL_MS = 5000;

interface MessagesResponse {
  conversations: BotConversation[];
  messages: BotMessageRow[];
  contacts: BotContact[];
  uniqueUserCount: number;
}

/** A selection key is `chatId`, or `chatId|connectionId` for a Telegram Business chat (chat IDs are numeric, so the first "|" splits). */
function parseKey(key: string): { chatId: string; connectionId: string | null } {
  const i = key.indexOf("|");
  return i < 0 ? { chatId: key, connectionId: null } : { chatId: key.slice(0, i), connectionId: key.slice(i + 1) || null };
}

function readChatParam(): string | null {
  return new URLSearchParams(window.location.search).get("chat");
}

function writeChatParam(chatId: string | null) {
  const url = new URL(window.location.href);
  if (chatId) url.searchParams.set("chat", chatId);
  else url.searchParams.delete("chat");
  window.history.replaceState(null, "", url);
}

export function MessagesTab({ bot, onChange }: { bot: BotDetail; onChange: () => void }) {
  const [conversations, setConversations] = useState<BotConversation[]>([]);
  const [contacts, setContacts] = useState<BotContact[]>([]);
  const [messages, setMessages] = useState<BotMessageRow[]>([]);
  const [uniqueUserCount, setUniqueUserCount] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [forwarding, setForwarding] = useState<BotMessageRow | null>(null);
  const [forwardBusy, setForwardBusy] = useState(false);
  // Bumped after a contact refresh so every avatar of this bot refetches.
  const [photoVersion, setPhotoVersion] = useState(0);
  // Tracks the last-seen data so a poll that returns the same thing skips the state update
  // (and the re-render it would otherwise cause) entirely.
  const lastSignature = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);

  function select(chatId: string | null) {
    selectedRef.current = chatId;
    lastSignature.current = null;
    setSelected(chatId);
    setMessages([]);
    writeChatParam(chatId);
  }

  async function loadMessages() {
    const chatId = selectedRef.current;
    try {
      const target = chatId ? parseKey(chatId) : null;
      const qs = target
        ? `?chatId=${encodeURIComponent(target.chatId)}${target.connectionId ? `&connectionId=${encodeURIComponent(target.connectionId)}` : ""}`
        : "";
      const result = await apiFetch<MessagesResponse>(`/api/bots/${bot.id}/messages${qs}`);
      if (selectedRef.current !== chatId) return; // user switched chats while this was in flight
      const signature = [
        chatId,
        result.uniqueUserCount,
        result.conversations.map((c) => `${c.key}:${c.count}:${c.lastAt}`).join(","),
        // Edits and pins change a message without changing its ID, so they belong in the signature too.
        result.messages.map((m) => `${m.id}:${m.editedAt ?? ""}:${m.pinned ? 1 : 0}:${m.deletedAt ?? ""}`).join(","),
      ].join("|");
      if (signature === lastSignature.current) return;
      lastSignature.current = signature;
      setConversations(result.conversations);
      setContacts(result.contacts);
      setMessages(result.messages);
      setUniqueUserCount(result.uniqueUserCount);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load messages.");
    }
  }

  useEffect(() => {
    // Restore the deep-linked chat (?chat=) once on mount.
    const fromUrl = readChatParam();
    if (fromUrl && selectedRef.current === null) {
      selectedRef.current = fromUrl;
      setSelected(fromUrl);
    }
  }, []);

  useEffect(() => {
    // Intentional: fetch-on-mount/poll into local state, not state synchronization.
    void loadMessages();
    if (!bot.monitorEnabled) return;

    let interval: ReturnType<typeof setInterval> | null = null;
    function startPolling() {
      if (interval) return;
      interval = setInterval(() => void loadMessages(), POLL_INTERVAL_MS);
    }
    function stopPolling() {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    }
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        stopPolling();
      } else {
        void loadMessages();
        startPolling();
      }
    }

    if (document.visibilityState === "visible") startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot.id, bot.monitorEnabled]);

  async function handleSend(payload: SendPayload): Promise<boolean> {
    const key = selectedRef.current;
    if (!key) return false;
    const { chatId, connectionId } = parseKey(key);
    setSending(true);
    try {
      let result: { message: BotMessageRow };
      if (payload.file) {
        const body = new FormData();
        body.append("chatId", chatId);
        if (connectionId) body.append("businessConnectionId", connectionId);
        body.append("file", payload.file);
        body.append("caption", payload.text);
        if (payload.parseMode) body.append("parseMode", payload.parseMode);
        if (payload.replyTo) body.append("replyTo", String(payload.replyTo));
        if (payload.asFile) body.append("asFile", "true");
        if (payload.effectId) body.append("effectId", payload.effectId);
        result = await apiFetch(`/api/bots/${bot.id}/messages`, { body });
      } else {
        result = await apiFetch(`/api/bots/${bot.id}/messages`, {
          body: {
            chatId,
            text: payload.text,
            parseMode: payload.parseMode || undefined,
            replyTo: payload.replyTo,
            buttons: payload.buttons,
            replyKeyboard: payload.replyKeyboard,
            effectId: payload.effectId,
            businessConnectionId: connectionId ?? undefined,
          },
        });
      }
      // The user may have switched chats while the send was in flight.
      if (selectedRef.current === key) setMessages((prev) => [...prev, result.message]);
      lastSignature.current = null;
      // Reconcile now (conversation list's last text, and any poll that was in flight during the send).
      await loadMessages();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send.");
      return false;
    } finally {
      setSending(false);
    }
  }

  /** Shows "typing…" to the user while the composer has text. Fire-and-forget; the pane throttles it. */
  function handleTyping() {
    const key = selectedRef.current;
    if (!key) return;
    const { chatId, connectionId } = parseKey(key);
    if (connectionId) return; // the typing indicator isn't available in a business chat
    apiFetch(`/api/bots/${bot.id}/typing`, { body: { chatId } }).catch(() => {});
  }

  function replaceMessage(updated: BotMessageRow) {
    setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    lastSignature.current = null;
  }

  async function handleEditMessage(message: BotMessageRow, text: string, parseMode: ParseModeChoice): Promise<boolean> {
    try {
      const { message: updated } = await apiFetch<{ message: BotMessageRow }>(
        `/api/bots/${bot.id}/messages/${message.id}`,
        { method: "PATCH", body: { text, parseMode: parseMode || undefined } }
      );
      replaceMessage(updated);
      toast.success("Message edited.");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to edit the message.");
      return false;
    }
  }

  async function handlePinMessage(message: BotMessageRow) {
    try {
      const { message: updated } = await apiFetch<{ message: BotMessageRow }>(
        `/api/bots/${bot.id}/messages/${message.id}/pin`,
        { body: { pinned: !message.pinned } }
      );
      replaceMessage(updated);
      toast.success(updated.pinned ? "Message pinned." : "Message unpinned.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change the pin.");
    }
  }

  async function handleStopPoll(message: BotMessageRow) {
    try {
      const { message: updated } = await apiFetch<{ message: BotMessageRow }>(`/api/bots/${bot.id}/messages/${message.id}/poll`, { method: "POST" });
      replaceMessage(updated);
      toast.success("Poll stopped.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to stop the poll.");
    }
  }

  async function handlePollSent() {
    lastSignature.current = null;
    await loadMessages();
  }

  async function handleForward(message: BotMessageRow, toChatId: string, copy: boolean) {
    setForwardBusy(true);
    try {
      await apiFetch(`/api/bots/${bot.id}/messages/${message.id}/forward`, { body: { toChatId, copy } });
      toast.success(copy ? "Message copied." : "Message forwarded.");
      setForwarding(null);
      lastSignature.current = null;
      await loadMessages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to forward the message.");
    } finally {
      setForwardBusy(false);
    }
  }

  async function handleDeleteMessage(message: BotMessageRow) {
    setMessages((prev) => prev.filter((m) => m.id !== message.id));
    try {
      const result = await apiFetch<{ deletedInTelegram: boolean }>(
        `/api/bots/${bot.id}/messages/${message.id}`,
        { method: "DELETE" }
      );
      if (message.telegramMessageId != null && !result.deletedInTelegram) {
        toast.success("Removed here. Telegram no longer allows deleting that message.");
      } else {
        toast.success("Message deleted.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete message.");
    }
    lastSignature.current = null;
    await loadMessages();
  }

  async function handleRefreshContact() {
    const key = selectedRef.current;
    if (!key) return;
    const { chatId } = parseKey(key);
    setRefreshing(true);
    try {
      await apiFetch(`/api/bots/${bot.id}/contacts/${encodeURIComponent(chatId)}/refresh`, { method: "POST" });
      setPhotoVersion((v) => v + 1);
      lastSignature.current = null;
      await loadMessages();
      toast.success("Contact refreshed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to refresh the contact.");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleClear() {
    const key = selectedRef.current;
    if (!key) return;
    const { chatId, connectionId } = parseKey(key);
    setClearing(true);
    try {
      const scope = connectionId ? `&connectionId=${encodeURIComponent(connectionId)}` : "";
      await apiFetch(`/api/bots/${bot.id}/messages?chatId=${encodeURIComponent(chatId)}${scope}`, { method: "DELETE" });
      toast.success("Conversation cleared.");
      select(null);
      await loadMessages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear conversation.");
    } finally {
      setClearing(false);
    }
  }

  const selectedName =
    conversations.find((c) => c.key === selected)?.name ??
    contacts.find((c) => c.chatId === selected)?.name ??
    selected ??
    "";

  return (
    <div className="space-y-4">
      {!bot.monitorEnabled && (
        <p className="text-xs text-[var(--muted)]">
          Monitoring is off, so new messages aren&apos;t being collected. Turn it on with the switch in the header.
        </p>
      )}

      <Card className="grid h-[calc(100dvh-16.5rem)] min-h-[420px] grid-cols-1 overflow-hidden p-0 md:grid-cols-[280px_1fr]">
        <ConversationList
          botId={bot.id}
          photoVersion={photoVersion}
          conversations={conversations}
          contacts={contacts}
          selected={selected}
          onSelect={select}
          className={cn(selected && "hidden md:flex")}
        />
        {selected ? (
          <ChatPane
            key={selected}
            botId={bot.id}
            bot={bot}
            photoVersion={photoVersion}
            refreshing={refreshing}
            onRefreshContact={handleRefreshContact}
            chatId={parseKey(selected).chatId}
            businessConnectionId={parseKey(selected).connectionId ?? undefined}
            name={selectedName}
            messages={messages}
            sending={sending}
            monitorEnabled={bot.monitorEnabled}
            clearing={clearing}
            onSend={handleSend}
            onTyping={handleTyping}
            messageActions={{
              onDelete: handleDeleteMessage,
              onEdit: handleEditMessage,
              onPin: handlePinMessage,
              onForward: setForwarding,
              onStopPoll: handleStopPoll,
            }}
            onPollSent={() => void handlePollSent()}
            onClear={handleClear}
            onBack={() => select(null)}
          />
        ) : (
          <div className="hidden items-center justify-center p-6 text-center text-sm text-[var(--muted)] md:flex">
            {bot.monitorEnabled || conversations.length > 0
              ? "Select a chat to read and reply."
              : "Enable monitoring to start collecting messages."}
          </div>
        )}
      </Card>

      <ForwardDialog
        message={forwarding}
        conversations={conversations.filter((c) => !c.connectionId)}
        contacts={contacts}
        busy={forwardBusy}
        onClose={() => setForwarding(null)}
        onForward={handleForward}
      />
    </div>
  );
}
