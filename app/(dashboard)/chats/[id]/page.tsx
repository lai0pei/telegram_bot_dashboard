"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FadeIn } from "@/components/motion";
import { DetailHeader } from "../../detail-header";
import { KIND_LABELS, type ChatDetail } from "./types";
import { InfoTab } from "./info-tab";
import { SettingsTab } from "./settings-tab";
import { BotsTab } from "./bots-tab";
import { DangerTab } from "./danger-tab";
import ChatDetailLoading from "./loading";

export default function ChatDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [chat, setChat] = useState<ChatDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<ChatDetail>(`/api/chats/${params.id}`);
      setChat(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load chat.");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    // Intentional: fetch-on-mount into local state, not state synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (loading && !chat) return <ChatDetailLoading />;
  if (!chat) return <p className="text-sm text-[var(--danger)]">Chat not found.</p>;

  return (
    <FadeIn className="space-y-6">
      <DetailHeader
        title={chat.title}
        subtitle={`${KIND_LABELS[chat.kind]} · ${chat.username ? `@${chat.username}` : "private"} · ${
          chat.isCreator ? "owner" : "admin"
        }`}
        backHref="/chats"
        backLabel="Channels & groups"
      />

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="bots">Bots</TabsTrigger>
          {chat.isCreator && <TabsTrigger value="danger">Danger zone</TabsTrigger>}
        </TabsList>

        <TabsContent value="info">
          <InfoTab chat={chat} onChange={load} />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab key={`${chat.title}|${chat.about}|${chat.username}`} chat={chat} onSaved={load} />
        </TabsContent>
        <TabsContent value="bots">
          <BotsTab chat={chat} />
        </TabsContent>
        {chat.isCreator && (
          <TabsContent value="danger">
            <DangerTab chat={chat} onDeleted={() => router.push("/chats")} />
          </TabsContent>
        )}
      </Tabs>
    </FadeIn>
  );
}
