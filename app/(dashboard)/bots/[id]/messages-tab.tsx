"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/api-client";
import type { BotDetail, BotMessageRow } from "./types";

export function MessagesTab({ bot, onChange }: { bot: BotDetail; onChange: () => void }) {
  const [messages, setMessages] = useState<BotMessageRow[]>([]);
  const [uniqueUserCount, setUniqueUserCount] = useState(0);
  const [replyChatId, setReplyChatId] = useState("");
  const [replyText, setReplyText] = useState("");
  const [toggling, setToggling] = useState(false);

  async function loadMessages() {
    try {
      const result = await apiFetch<{ messages: BotMessageRow[]; uniqueUserCount: number }>(
        `/api/bots/${bot.id}/messages`
      );
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
    const interval = setInterval(() => void loadMessages(), 5000);
    return () => clearInterval(interval);
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
    try {
      await apiFetch(`/api/bots/${bot.id}/messages`, { body: { chatId: replyChatId, text: replyText } });
      setReplyText("");
      toast.success("Sent.");
      loadMessages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send.");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="flex items-center justify-between">
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
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-lg p-2 text-sm ${
                  m.direction === "in" ? "bg-black/5 dark:bg-white/5" : "bg-[var(--primary)]/10"
                }`}
              >
                <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                  <span>
                    {m.direction === "in" ? m.fromFirstName ?? m.fromUsername ?? m.chatId : "You"} · chat {m.chatId}
                  </span>
                  <span>{new Date(m.createdAt).toLocaleString()}</span>
                </div>
                <div>{m.text}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold">Send a message</h3>
        <form onSubmit={handleReply} className="flex gap-2">
          <Input placeholder="Chat ID" value={replyChatId} onChange={(e) => setReplyChatId(e.target.value)} className="w-40" required />
          <Input placeholder="Message" value={replyText} onChange={(e) => setReplyText(e.target.value)} className="flex-1" required />
          <Button type="submit">Send</Button>
        </form>
      </Card>
    </div>
  );
}
