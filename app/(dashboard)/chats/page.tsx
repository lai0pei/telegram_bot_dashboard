"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, RefreshCw, SearchX, Users } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stagger, fade } from "@/components/motion";
import { ChatCard } from "../chat-card";
import { CardGridSkeleton } from "../loading";
import { FilterChips, SearchInput, matchesQuery, useSlashToSearch } from "../list-toolbar";
import { NoActiveAccount, isNoActiveAccount } from "../no-active-account";
import type { ChatSummary } from "./[id]/types";

type Filter = "all" | "channel" | "group" | "owned";

const FILTERS: { value: Filter; label: string; test: (chat: ChatSummary) => boolean }[] = [
  { value: "all", label: "All", test: () => true },
  { value: "channel", label: "Channels", test: (c) => c.kind === "channel" },
  { value: "group", label: "Groups", test: (c) => c.kind !== "channel" },
  { value: "owned", label: "Owned by me", test: (c) => c.isCreator },
];

function isFilter(value: string | null): value is Filter {
  return FILTERS.some((f) => f.value === value);
}

export default function ChatsPage() {
  return (
    <Suspense fallback={<CardGridSkeleton />}>
      <ChatsList />
    </Suspense>
  );
}

function ChatsList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filterParam = searchParams.get("filter");
  const filter: Filter = isFilter(filterParam) ? filterParam : "all";

  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [noActiveAccount, setNoActiveAccount] = useState(false);
  const [query, setQuery] = useState("");
  useSlashToSearch();

  async function load() {
    setLoading(true);
    try {
      const result = await apiFetch<{ chats: ChatSummary[] }>("/api/chats");
      setChats(result.chats.slice().sort((a, b) => a.title.localeCompare(b.title)));
    } catch (err) {
      if (isNoActiveAccount(err)) setNoActiveAccount(true);
      else toast.error(err instanceof Error ? err.message : "Failed to load channels and groups.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Intentional: fetch-on-mount into local state, not state synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  function setFilter(next: Filter) {
    const params = new URLSearchParams(searchParams);
    if (next === "all") params.delete("filter");
    else params.set("filter", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const options = useMemo(
    () => FILTERS.map((f) => ({ value: f.value, label: f.label, count: chats?.filter(f.test).length ?? 0 })),
    [chats]
  );
  const visible = useMemo(() => {
    const test = FILTERS.find((f) => f.value === filter)!.test;
    return (chats ?? []).filter((c) => test(c) && matchesQuery(query, c.title, c.username, c.botApiId));
  }, [chats, filter, query]);

  if (noActiveAccount) return <NoActiveAccount />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Channels &amp; groups</h1>
          <p className="text-sm text-[var(--muted)]">Ones this Telegram account owns or admins, synced from its chats.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} loading={loading && Boolean(chats)}>
            {!(loading && chats) && <RefreshCw className="h-3.5 w-3.5" />}
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

      {loading && !chats ? (
        <CardGridSkeleton />
      ) : chats && chats.length === 0 ? (
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
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SearchInput value={query} onChange={setQuery} placeholder="Search by name, @username or ID — press /" />
            <FilterChips options={options} value={filter} onChange={setFilter} />
          </div>

          <motion.div initial={fade.initial} animate={{ opacity: loading ? 0.6 : 1 }} transition={{ duration: 0.15 }}>
            {visible.length === 0 ? (
              <Card className="flex flex-col items-center gap-2 py-10 text-center text-sm text-[var(--muted)]">
                <SearchX className="h-7 w-7" />
                <p>Nothing matches {query ? <>&ldquo;{query}&rdquo;</> : "this filter"}.</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  Clear filters
                </Button>
              </Card>
            ) : (
              <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((chat) => (
                  <ChatCard key={chat.id} chat={chat} />
                ))}
              </Stagger>
            )}
          </motion.div>
        </>
      )}
    </div>
  );
}
