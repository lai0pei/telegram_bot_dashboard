"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";
import type { ChatDetail } from "./types";

interface BotOption {
  id: number;
  username: string;
}

export function BotsTab({ chat }: { chat: ChatDetail }) {
  const [bots, setBots] = useState<BotOption[] | null>(null);
  const [botId, setBotId] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    apiFetch<{ bots: BotOption[] }>("/api/bots")
      .then((result) => {
        setBots(result.bots);
        if (result.bots[0]) setBotId(String(result.bots[0].id));
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load bots."));
  }, []);

  async function handleAdd() {
    if (!botId) return;
    setAdding(true);
    try {
      await apiFetch(`/api/chats/${chat.id}/admins`, { body: { botId: Number(botId) } });
      const bot = bots?.find((b) => String(b.id) === botId);
      toast.success(`@${bot?.username} is now an admin.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add bot.");
    } finally {
      setAdding(false);
    }
  }

  const rights =
    chat.kind === "channel"
      ? "post, edit and delete messages, and invite users"
      : "delete messages, ban users, pin messages, and invite users";

  return (
    <Card>
      <h3 className="mb-1 text-sm font-semibold">Add a bot as admin</h3>
      <p className="mb-3 text-sm text-[var(--muted)]">
        Adds one of your bots to this chat and promotes it to admin. It will be able to {rights}.
      </p>
      {!chat.canAddAdmins ? (
        <p className="text-sm text-[var(--muted)]">You don&apos;t have the &quot;Add admins&quot; right here.</p>
      ) : bots === null ? (
        <p className="text-sm text-[var(--muted)]">Loading bots…</p>
      ) : bots.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">You don&apos;t have any bots yet.</p>
      ) : (
        <div className="flex items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="bot">Bot</Label>
            <select
              id="bot"
              className="h-10 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              value={botId}
              onChange={(e) => setBotId(e.target.value)}
            >
              {bots.map((b) => (
                <option key={b.id} value={b.id}>
                  @{b.username}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={handleAdd} loading={adding} disabled={!botId}>
            Add as admin
          </Button>
        </div>
      )}
    </Card>
  );
}
