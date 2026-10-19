"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import type { BotDetail } from "./types";
import { InfoTab } from "./info-tab";
import { SettingsTab } from "./settings-tab";
import { CommandsTab } from "./commands-tab";
import { WebhookTab } from "./webhook-tab";
import { MessagesTab } from "./messages-tab";
import { DangerTab } from "./danger-tab";

export default function BotDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [bot, setBot] = useState<BotDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<BotDetail>(`/api/bots/${params.id}`);
      setBot(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load bot.");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    // Intentional: fetch-on-mount into local state, not state synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (loading && !bot) return <p className="text-sm text-[var(--muted)]">Loading…</p>;
  if (!bot) return <p className="text-sm text-[var(--danger)]">Bot not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">@{bot.username}</h1>
        <p className="text-sm text-[var(--muted)]">{bot.firstName}</p>
      </div>

      {!bot.hasToken && (
        <Card className="text-sm">
          No token stored yet.{" "}
          <button
            className="text-[var(--primary)] hover:underline"
            onClick={async () => {
              try {
                await apiFetch(`/api/bots/${bot.id}/token`);
                toast.success("Token fetched.");
                load();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to fetch token.");
              }
            }}
          >
            Fetch it from BotFather
          </button>
          .
        </Card>
      )}

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="commands">Commands</TabsTrigger>
          <TabsTrigger value="webhook">Webhook</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="danger">Danger zone</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <InfoTab bot={bot} onChange={load} />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab bot={bot} onSaved={load} />
        </TabsContent>
        <TabsContent value="commands">
          <CommandsTab bot={bot} onSaved={load} />
        </TabsContent>
        <TabsContent value="webhook">
          <WebhookTab bot={bot} onChange={load} />
        </TabsContent>
        <TabsContent value="messages">
          <MessagesTab bot={bot} onChange={load} />
        </TabsContent>
        <TabsContent value="danger">
          <DangerTab bot={bot} onDeleted={() => router.push("/")} onTokenChanged={load} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
