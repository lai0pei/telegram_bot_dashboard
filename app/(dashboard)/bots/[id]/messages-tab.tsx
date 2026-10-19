"use client";

import { Send } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FieldError } from "@/components/ui/field-error";
import { apiFetch } from "@/lib/api-client";
import { validateChatId, validateMessageText } from "@/lib/validation";
import type { BotDetail, BotMessageRow } from "./types";
import { MessageRow } from "./message-row";

const POLL_INTERVAL_MS = 5000;

export function MessagesTab({ bot, onChange }: { bot: BotDetail; onChange: () => void }) {
  const [messages, setMessages] = useState<BotMessageRow[]>([]);
  const [uniqueUserCount, setUniqueUserCount] = useState(0);
  const [replyChatId, setReplyChatId] = useState("");
  const [replyText, setReplyText] = useState("");
  const [toggling, setToggling] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyTouched, setReplyTouched] = useState(false);
  // Tracks the last-seen messages so a poll that returns the same data skips the state update
  // (and the re-render it would otherwise cause) entirely.
  const lastSignature = useRef<string | null>(null);

  const chatIdError = replyChatId ? validateChatId(replyChatId) : null;
  const textError = replyText ? validateMessageText(replyText) : null;

  async function loadMessages() {
    try {
      const result = await apiFetch<{ messages: BotMessageRow[]; uniqueUserCount: number }>(
        `/api/bots/${bot.id}/messages`
      );
      const signature = `${result.uniqueUserCount}:${result.messages.map((m) => m.id).join(",")}`;
      if (signature === lastSignature.current) return;
      lastSignature.current = signature;
      setMessages(result.messages);
      setUniqueUserCount(result.uniqueUserCount);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load messages.");
    }
  }

  useEffect(() => {
    // Intentional: fetch-on-mount/poll into local state, not state synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  async function handleToggleMonitor(enabled: boolean) {
    setToggling(true);
    try {
      await apiFetch(`/api/bots/${bot.id}/monitor`, { method: "PUT", body: { enabled } });
      toast.success(enabled ? "Monitoring enabled." : "Monitoring disabled.");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle monitoring.");
    } finally {
      setToggling(false);
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    setReplyTouched(true);
    if (validateChatId(replyChatId) || validateMessageText(replyText)) return;
    setSending(true);
    try {
      await apiFetch(`/api/bots/${bot.id}/messages`, { body: { chatId: replyChatId, text: replyText } });
      setReplyText("");
      toast.success("Sent.");
      await loadMessages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Monitor incoming messages</h3>
          <p className="text-xs text-[var(--muted)]">
            Polls getUpdates in the background. {uniqueUserCount} unique chat(s) seen.
          </p>
        </div>
        <Switch checked={bot.monitorEnabled} disabled={toggling} onCheckedChange={handleToggleMonitor} />
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold">Recent messages</h3>
        {messages.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            {bot.monitorEnabled ? "No messages yet." : "Enable monitoring to start collecting messages."}
          </p>
        ) : (
          <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <MessageRow key={m.id} message={m} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold">Send a message</h3>
        <form onSubmit={handleReply} className="space-y-1.5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Chat ID"
              value={replyChatId}
              onChange={(e) => setReplyChatId(e.target.value)}
              className="sm:w-40"
              required
            />
            <Input
              placeholder="Message"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              className="flex-1"
              maxLength={4096}
              required
            />
            <Button type="submit" loading={sending} disabled={Boolean(chatIdError || textError)}>
              <Send className="h-3.5 w-3.5" />
              Send
            </Button>
          </div>
          {replyTouched && <FieldError error={chatIdError ?? textError} />}
        </form>
      </Card>
    </div>
  );
}
