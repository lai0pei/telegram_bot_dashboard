"use client";

import { Bot as BotIcon, Plus, RefreshCw, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { apiFetch, getMe, type Me } from "@/lib/api-client";
import { FadeIn, Stagger, fade } from "@/components/motion";
import { AccountCardSkeleton, CardGridSkeleton } from "./loading";
import { BotCard, type BotSummary } from "./bot-card";
import { ChatCard } from "./chat-card";
import type { ChatSummary } from "./chats/[id]/types";

export default function OverviewPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [bots, setBots] = useState<BotSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [chatsLoading, setChatsLoading] = useState(true);

  useEffect(() => {
    void load();
    // Loaded separately: syncing walks the user's whole dialog list, so it shouldn't hold up the bots.
    void loadChats();
  }, []);

  async function loadChats() {
    setChatsLoading(true);
    try {
      const result = await apiFetch<{ chats: ChatSummary[] }>("/api/chats");
      setChats(result.chats);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load channels and groups.");
    } finally {
      setChatsLoading(false);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const [meResult, botsResult] = await Promise.all([getMe(), apiFetch<{ bots: BotSummary[] }>("/api/bots")]);
      setMe(meResult);
      setBots(botsResult.bots);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      {me ? (
        <FadeIn>
          <Card>
            <CardHeader>
              <CardTitle>Your Telegram account</CardTitle>
            </CardHeader>
            {me.loggedIn ? (
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Field label="Name" value={[me.firstName, me.lastName].filter(Boolean).join(" ") || "—"} />
                <Field label="Username" value={me.username ? `@${me.username}` : "—"} />
                <Field label="Chat ID" value={me.chatId ?? "—"} mono copy />
                <Field label="Phone" value={me.phone ? `+${me.phone}` : "—"} />
              </dl>
            ) : (
              <p className="text-sm text-[var(--muted)]">Not signed in.</p>
            )}
          </Card>
        </FadeIn>
      ) : (
        <AccountCardSkeleton />
      )}

      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Your bots</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} loading={loading && Boolean(bots)}>
              {!(loading && bots) && <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
            <Button size="sm" asChild>
              <Link href="/bots/new">
                <Plus className="h-3.5 w-3.5" />
                New bot
              </Link>
            </Button>
          </div>
        </div>

        {loading && !bots ? (
          <CardGridSkeleton />
        ) : (
          <motion.div
            initial={fade.initial}
            animate={{ opacity: loading ? 0.6 : 1 }}
            transition={{ duration: 0.15 }}
          >
            {bots && bots.length === 0 && (
              <Card className="flex flex-col items-center gap-3 py-10 text-center text-sm text-[var(--muted)]">
                <BotIcon className="h-8 w-8 text-[var(--muted)]" />
                <p>No bots yet. Create one, or ask Telegram — bots you already own should show up automatically.</p>
                <Button size="sm" asChild>
                  <Link href="/bots/new">
                    <Plus className="h-3.5 w-3.5" />
                    New bot
                  </Link>
                </Button>
              </Card>
            )}

            <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {bots?.map((bot) => (
                <BotCard key={bot.id} bot={bot} />
              ))}
            </Stagger>
          </motion.div>
        )}
      </div>

      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Your channels &amp; groups</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadChats} loading={chatsLoading && Boolean(chats)}>
              {!(chatsLoading && chats) && <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
            <Button size="sm" asChild>
              <Link href="/chats/new">
                <Plus className="h-3.5 w-3.5" />
                New channel or group
              </Link>
            </Button>
          </div>
        </div>

        {chatsLoading && !chats ? (
          <CardGridSkeleton />
        ) : (
          <motion.div
            initial={fade.initial}
            animate={{ opacity: chatsLoading ? 0.6 : 1 }}
            transition={{ duration: 0.15 }}
          >
            {chats && chats.length === 0 && (
              <Card className="flex flex-col items-center gap-3 py-10 text-center text-sm text-[var(--muted)]">
                <Users className="h-8 w-8 text-[var(--muted)]" />
                <p>No channels or groups yet. Ones you own or admin show up here automatically.</p>
                <Button size="sm" asChild>
                  <Link href="/chats/new">
                    <Plus className="h-3.5 w-3.5" />
                    New channel or group
                  </Link>
                </Button>
              </Card>
            )}

            <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {chats?.map((chat) => (
                <ChatCard key={chat.id} chat={chat} />
              ))}
            </Stagger>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, mono, copy }: { label: string; value: string; mono?: boolean; copy?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className={`flex items-center gap-1 font-medium ${mono ? "font-mono" : ""}`}>
        <span className="truncate">{value}</span>
        {copy && value !== "—" && <CopyButton value={value} />}
      </dd>
    </div>
  );
}
