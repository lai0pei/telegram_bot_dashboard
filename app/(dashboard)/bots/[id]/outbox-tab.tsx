"use client";

import { Info, Megaphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-client";
import { validateChatId, validateMessageText, validateSendAt } from "@/lib/validation";
import { ButtonsEditor, draftsError, draftsToButtons, type ButtonDraft } from "./buttons-editor";
import type { BotDetail, BroadcastItem, ParseModeChoice, ScheduledItem } from "./types";

const select = "h-10 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 text-sm";
const textarea =
  "w-full rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]";

const STATUS_VARIANT = { queued: "default", running: "primary", done: "success", cancelled: "default", failed: "danger" } as const;

/** Broadcasts to all contacts and messages scheduled for later. Both are sent by the server's job loop. */
export function OutboxTab({ bot }: { bot: BotDetail }) {
  if (!bot.hasToken) {
    return <Card className="text-sm">Fetch the bot&apos;s token first (see the banner above) to send messages from here.</Card>;
  }
  return (
    <div className="grid items-start gap-4 xl:grid-cols-2">
      <BroadcastCard bot={bot} />
      <ScheduledCard bot={bot} />
    </div>
  );
}

function BroadcastCard({ bot }: { bot: BotDetail }) {
  const [data, setData] = useState<{ recipients: number; broadcasts: BroadcastItem[] } | null>(null);
  const [text, setText] = useState("");
  const [parseMode, setParseMode] = useState<ParseModeChoice>("");
  const [drafts, setDrafts] = useState<ButtonDraft[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch(`/api/bots/${bot.id}/broadcasts`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load broadcasts.");
    }
  }, [bot.id]);

  useEffect(() => {
    // Intentional: fetch-on-mount into local state, not state synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const active = data?.broadcasts.some((b) => b.status === "queued" || b.status === "running") ?? false;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void load(), 2000);
    return () => clearInterval(timer);
  }, [active, load]);

  const error = text ? validateMessageText(text) ?? draftsError(drafts, "1") : null;
  const canSend = Boolean(text.trim()) && !error && !active && (data?.recipients ?? 0) > 0 && !sending;

  async function send() {
    setSending(true);
    try {
      await apiFetch(`/api/bots/${bot.id}/broadcasts`, { body: { text, parseMode: parseMode || undefined, buttons: draftsToButtons(drafts) } });
      toast.success("Broadcast started.");
      setText("");
      setDrafts([]);
      setConfirming(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start the broadcast.");
    } finally {
      setSending(false);
    }
  }

  async function cancel(b: BroadcastItem) {
    try {
      await apiFetch(`/api/bots/${bot.id}/broadcasts/${b.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Broadcast</CardTitle>
        {data && (
          <span className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
            <Megaphone className="h-3.5 w-3.5" aria-hidden />
            {data.recipients} {data.recipients === 1 ? "person" : "people"} can be reached
          </span>
        )}
      </CardHeader>
      <div className="space-y-3">
        <p className="flex items-start gap-1.5 text-xs text-[var(--muted)]">
          <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          Sent one by one to everyone who has written to the bot, skipping anyone who blocked it. Only people the dashboard has seen are included, and
          messages aren&apos;t added to the conversations.
        </p>
        <textarea value={text} onChange={(e) => { setText(e.target.value); setConfirming(false); }} rows={4} maxLength={4096} placeholder="Message to everyone…" aria-label="Broadcast message" className={textarea} />
        <div className="flex items-center gap-2">
          <Label htmlFor="broadcast-format" className="shrink-0">
            Format
          </Label>
          <select id="broadcast-format" className={select} value={parseMode} onChange={(e) => setParseMode(e.target.value as ParseModeChoice)}>
            <option value="">Plain text</option>
            <option value="HTML">HTML</option>
            <option value="MarkdownV2">MarkdownV2</option>
          </select>
        </div>
        <ButtonsEditor drafts={drafts} onChange={setDrafts} botId={bot.id} chatId="1" inlineMode={bot.info?.supports_inline_queries} />
        <FieldError error={error} />
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--card-border)] p-3 text-sm">
            <span className="flex-1">
              Send this to {data?.recipients} {data?.recipients === 1 ? "person" : "people"}? It can&apos;t be unsent.
            </span>
            <Button onClick={send} loading={sending}>
              Yes, send
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Back
            </Button>
          </div>
        ) : (
          <Button onClick={() => setConfirming(true)} disabled={!canSend}>
            {active ? "A broadcast is running…" : "Review and send"}
          </Button>
        )}
      </div>

      {data === null ? (
        <Skeleton className="mt-4 h-16" />
      ) : (
        data.broadcasts.length > 0 && (
          <ul className="mt-5 divide-y divide-[var(--card-border)] border-t border-[var(--card-border)]">
            {data.broadcasts.map((b) => {
              const handled = b.sent + b.failed + b.blocked;
              const live = b.status === "queued" || b.status === "running";
              return (
                <li key={b.id} className="space-y-1.5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant={STATUS_VARIANT[b.status]}>{b.status}</Badge>
                    <span className="min-w-0 flex-1 truncate">{b.text}</span>
                    {live && (
                      <Button variant="ghost" size="sm" onClick={() => void cancel(b)}>
                        Cancel
                      </Button>
                    )}
                  </div>
                  <div role="progressbar" aria-label="Broadcast progress" aria-valuemin={0} aria-valuemax={b.total} aria-valuenow={handled} className="h-1.5 overflow-hidden rounded-full bg-[var(--card-border)]">
                    <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${b.total ? Math.min(handled / b.total, 1) * 100 : 0}%` }} />
                  </div>
                  <p className="text-xs text-[var(--muted)]">
                    {b.sent} sent · {b.blocked} blocked the bot · {b.failed} failed · {b.total} total · {new Date(b.createdAt).toLocaleString()}
                  </p>
                  {b.error && <p className="text-xs text-[var(--danger)]">{b.error}</p>}
                </li>
              );
            })}
          </ul>
        )
      )}
    </Card>
  );
}

interface Destination {
  chatId: string;
  name: string;
  kind: "user" | "group" | "channel";
}

function ScheduledCard({ bot }: { bot: BotDetail }) {
  const [data, setData] = useState<{ scheduled: ScheduledItem[]; destinations: Destination[] } | null>(null);
  const [chatId, setChatId] = useState("");
  const [when, setWhen] = useState("");
  const [text, setText] = useState("");
  const [parseMode, setParseMode] = useState<ParseModeChoice>("");
  const [drafts, setDrafts] = useState<ButtonDraft[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch(`/api/bots/${bot.id}/scheduled`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load scheduled messages.");
    }
  }, [bot.id]);

  useEffect(() => {
    // Intentional: fetch-on-mount into local state, not state synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // datetime-local gives "YYYY-MM-DDTHH:mm" in the browser's time zone; the server only ever sees epoch milliseconds.
  const sendAt = when ? new Date(when).getTime() : NaN;
  const error = text || chatId || when ? validateChatId(chatId) ?? validateMessageText(text) ?? draftsError(drafts, chatId.trim() || undefined) ?? validateSendAt(sendAt) : null;
  const canSave = Boolean(chatId.trim() && text.trim() && when) && !error && !saving;

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/api/bots/${bot.id}/scheduled`, {
        body: { chatId: chatId.trim(), text, parseMode: parseMode || undefined, buttons: draftsToButtons(drafts), sendAt },
      });
      toast.success("Message scheduled.");
      setText("");
      setDrafts([]);
      setWhen("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to schedule the message.");
    } finally {
      setSaving(false);
    }
  }

  async function cancel(item: ScheduledItem) {
    try {
      await apiFetch(`/api/bots/${bot.id}/scheduled/${item.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel.");
      await load();
    }
  }

  const nameOf = (id: string) => data?.destinations.find((d) => d.chatId === id)?.name ?? id;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scheduled messages</CardTitle>
      </CardHeader>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sched-chat">Send to (chat ID)</Label>
            <Input id="sched-chat" list="sched-destinations" value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="Pick or type a chat ID" />
            <datalist id="sched-destinations">
              {data?.destinations.map((d) => (
                <option key={d.chatId} value={d.chatId}>
                  {d.name}
                </option>
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sched-when">When (your local time)</Label>
            <Input id="sched-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={4096} placeholder="Message…" aria-label="Scheduled message" className={textarea} />
        <div className="flex items-center gap-2">
          <Label htmlFor="sched-format" className="shrink-0">
            Format
          </Label>
          <select id="sched-format" className={select} value={parseMode} onChange={(e) => setParseMode(e.target.value as ParseModeChoice)}>
            <option value="">Plain text</option>
            <option value="HTML">HTML</option>
            <option value="MarkdownV2">MarkdownV2</option>
          </select>
        </div>
        <ButtonsEditor drafts={drafts} onChange={setDrafts} botId={bot.id} chatId={chatId.trim() || undefined} inlineMode={bot.info?.supports_inline_queries} />
        <FieldError error={error} />
        <Button onClick={save} disabled={!canSave} loading={saving}>
          Schedule
        </Button>
        <p className="text-xs text-[var(--muted)]">Sent by the server within a few seconds of the chosen time. If the server is off then, it goes out when it&apos;s back on.</p>
      </div>

      {data && data.scheduled.length > 0 && (
        <ul className="mt-5 divide-y divide-[var(--card-border)] border-t border-[var(--card-border)]">
          {data.scheduled.map((item) => (
            <li key={item.id} className="space-y-1 py-3">
              <div className="flex items-center gap-2 text-sm">
                <Badge variant={item.status === "sent" ? "success" : item.status === "failed" ? "danger" : item.status === "pending" ? "primary" : "default"}>{item.status}</Badge>
                <span className="min-w-0 flex-1 truncate">{item.text}</span>
                {item.status === "pending" && (
                  <Button variant="ghost" size="sm" onClick={() => void cancel(item)}>
                    Cancel
                  </Button>
                )}
              </div>
              <p className="text-xs text-[var(--muted)]">
                To {nameOf(item.chatId)} · {new Date(item.sendAt).toLocaleString()}
              </p>
              {item.error && <p className="text-xs text-[var(--danger)]">{item.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
