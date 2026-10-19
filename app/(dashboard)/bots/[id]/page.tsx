"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { FadeIn } from "@/components/motion";
import { DetailHeader } from "../../detail-header";
import type { BotDetail } from "./types";
import { InfoTab } from "./info-tab";
import { SettingsTab } from "./settings-tab";
import { CommandsTab } from "./commands-tab";
import { WebhookTab } from "./webhook-tab";
import { MessagesTab } from "./messages-tab";
import { DangerTab } from "./danger-tab";
import BotDetailLoading from "./loading";

export default function BotDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  // ?tab=messages etc. deep-links a tab (the overview's recent messages link here).
  const initialTab = useSearchParams().get("tab") ?? "info";
  const [bot, setBot] = useState<BotDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchingToken, setFetchingToken] = useState(false);

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

  async function fetchToken() {
    if (fetchingToken) return;
    setFetchingToken(true);
    try {
      await apiFetch(`/api/bots/${params.id}/token`);
      toast.success("Token fetched.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch token.");
    } finally {
      setFetchingToken(false);
    }
  }

  if (loading && !bot) return <BotDetailLoading />;
  if (!bot) return <p className="text-sm text-[var(--danger)]">Bot not found.</p>;

  return (
    <FadeIn className="space-y-6">
      <DetailHeader title={`@${bot.username}`} subtitle={bot.firstName} backHref="/bots" backLabel="Bots" />

      {!bot.hasToken && (
        <Card className="text-sm">
          No token stored yet.{" "}
          <button
            className="text-[var(--primary)] hover:underline disabled:cursor-wait disabled:no-underline disabled:opacity-60"
            disabled={fetchingToken}
            onClick={fetchToken}
          >
            {fetchingToken ? "Fetching from BotFather…" : "Fetch it from BotFather"}
          </button>
          .
        </Card>
      )}

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="commands">Commands</TabsTrigger>
          <TabsTrigger value="webhook">Webhook</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="danger">Danger zone</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <InfoTab bot={bot} onChange={load} onFetchToken={fetchToken} fetchingToken={fetchingToken} />
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
          <DangerTab bot={bot} onDeleted={() => router.push("/bots")} onTokenChanged={load} />
        </TabsContent>
      </Tabs>
    </FadeIn>
  );
}
