"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bot as BotIcon, CheckSquare, Plus, RefreshCw, SearchX } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stagger, fade } from "@/components/motion";
import { BotCard, type BotSummary } from "../bot-card";
import { BulkBar } from "../bulk-bar";
import { CardGridSkeleton } from "../loading";
import { FilterChips, SearchInput, matchesQuery, useSlashToSearch } from "../list-toolbar";
import { NoActiveAccount, isNoActiveAccount } from "../no-active-account";

type Filter = "all" | "monitoring" | "webhook" | "attention";

const FILTERS: { value: Filter; label: string; test: (bot: BotSummary) => boolean }[] = [
  { value: "all", label: "All", test: () => true },
  { value: "monitoring", label: "Monitoring", test: (b) => b.monitorEnabled },
  { value: "webhook", label: "Webhook", test: (b) => Boolean(b.webhook?.url) },
  { value: "attention", label: "Needs attention", test: (b) => !b.hasToken || Boolean(b.error) },
];

function isFilter(value: string | null): value is Filter {
  return FILTERS.some((f) => f.value === value);
}

export default function BotsPage() {
  return (
    <Suspense fallback={<CardGridSkeleton />}>
      <BotsList />
    </Suspense>
  );
}

function BotsList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filterParam = searchParams.get("filter");
  const filter: Filter = isFilter(filterParam) ? filterParam : "all";

  const [bots, setBots] = useState<BotSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [noActiveAccount, setNoActiveAccount] = useState(false);
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  useSlashToSearch();

  async function load() {
    setLoading(true);
    try {
      const result = await apiFetch<{ bots: BotSummary[] }>("/api/bots");
      setBots(result.bots.slice().sort((a, b) => a.username.localeCompare(b.username)));
    } catch (err) {
      if (isNoActiveAccount(err)) setNoActiveAccount(true);
      else toast.error(err instanceof Error ? err.message : "Failed to load bots.");
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
    () => FILTERS.map((f) => ({ value: f.value, label: f.label, count: bots?.filter(f.test).length ?? 0 })),
    [bots]
  );
  const visible = useMemo(() => {
    const test = FILTERS.find((f) => f.value === filter)!.test;
    return (bots ?? []).filter((b) => test(b) && matchesQuery(query, b.username, b.firstName));
  }, [bots, filter, query]);

  const toggle = (id: number) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  if (noActiveAccount) return <NoActiveAccount />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Bots</h1>
          <p className="text-sm text-[var(--muted)]">Every bot this Telegram account owns, synced from BotFather.</p>
        </div>
        <div className="flex gap-2">
          {bots && bots.length > 1 && (
            <Button
              variant={selecting ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setSelecting((v) => !v);
                setSelected([]);
              }}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {selecting ? "Done" : "Select"}
            </Button>
          )}
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
      ) : bots && bots.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center text-sm text-[var(--muted)]">
          <BotIcon className="h-8 w-8 text-[var(--muted)]" />
          <p>No bots yet. Create one — bots this account already owns show up here automatically.</p>
          <Button size="sm" asChild>
            <Link href="/bots/new">
              <Plus className="h-3.5 w-3.5" />
              New bot
            </Link>
          </Button>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SearchInput value={query} onChange={setQuery} placeholder="Search bots — press /" />
            <FilterChips options={options} value={filter} onChange={setFilter} />
          </div>

          {selecting && bots && (
            <>
              <div className="flex items-center gap-2 text-sm">
                <Button variant="ghost" size="sm" onClick={() => setSelected(visible.map((b) => b.id))}>
                  Select all shown
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
                  Clear
                </Button>
              </div>
              <BulkBar selected={selected} bots={bots} onDone={() => void load()} />
            </>
          )}

          <motion.div initial={fade.initial} animate={{ opacity: loading ? 0.6 : 1 }} transition={{ duration: 0.15 }}>
            {visible.length === 0 ? (
              <Card className="flex flex-col items-center gap-2 py-10 text-center text-sm text-[var(--muted)]">
                <SearchX className="h-7 w-7" />
                <p>No bots match {query ? <>&ldquo;{query}&rdquo;</> : "this filter"}.</p>
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
                {visible.map((bot) => (
                  <BotCard key={bot.id} bot={bot} selecting={selecting} selected={selected.includes(bot.id)} onToggle={toggle} />
                ))}
              </Stagger>
            )}
          </motion.div>
        </>
      )}
    </div>
  );
}
