"use client";

import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-client";
import { timeAgo } from "@/lib/time";
import { HealthCard } from "./info-tab";
import type { SectionId } from "./sections";
import type { AutoReplyRule, BotConversation, BotDetail, BotStatsData } from "./types";

type Load<T> = { state: "loading" } | { state: "error" } | { state: "ok"; data: T };

function useLoad<T>(url: string): Load<T> {
  const [result, setResult] = useState<Load<T>>({ state: "loading" });
  useEffect(() => {
    let live = true;
    apiFetch<T>(url)
      .then((data) => live && setResult({ state: "ok", data }))
      .catch(() => live && setResult({ state: "error" }));
    return () => {
      live = false;
    };
  }, [url]);
  return result;
}

function OpenLink({ to, label, onOpen }: { to: SectionId; label: string; onOpen: (section: SectionId) => void }) {
  return (
    <button type="button" onClick={() => onOpen(to)} className="flex items-center gap-1 text-xs text-[var(--primary)] hover:underline">
      {label}
      <ArrowRight className="h-3 w-3" aria-hidden />
    </button>
  );
}

function Body<T>({ result, children }: { result: Load<T>; children: (data: T) => React.ReactNode }) {
  if (result.state === "loading") return <Skeleton className="h-20" />;
  if (result.state === "error") return <p className="text-sm text-[var(--danger)]">Couldn&apos;t load this.</p>;
  return <>{children(result.data)}</>;
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-[var(--muted)]">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value.toLocaleString()}</dd>
    </div>
  );
}

/** One screen answering "what is going on with this bot"; every card links to the section that edits it. */
export function OverviewSection({
  bot,
  photoSrc,
  onChange,
  onOpen,
}: {
  bot: BotDetail;
  photoSrc: string;
  onChange: () => void;
  onOpen: (section: SectionId, chat?: string) => void;
}) {
  const stats = useLoad<BotStatsData>(`/api/bots/${bot.id}/stats`);
  const rules = useLoad<{ rules: AutoReplyRule[] }>(`/api/bots/${bot.id}/auto-replies`);
  const messages = useLoad<{ conversations: BotConversation[] }>(`/api/bots/${bot.id}/messages`);
  const open = (section: SectionId) => onOpen(section);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <OpenLink to="profile" label="Edit" onOpen={open} />
        </CardHeader>
        <div className="flex items-start gap-3">
          <Avatar src={photoSrc} name={bot.username} className="h-12 w-12 shrink-0" />
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{bot.name || bot.firstName}</p>
            <p className="truncate text-[var(--muted)]">@{bot.username}</p>
            <p className="mt-1 line-clamp-2 text-[var(--muted)]">{bot.shortDescription || "No short description."}</p>
          </div>
        </div>
        <p className="mt-3 line-clamp-3 text-sm text-[var(--muted)]">{bot.description || "No description set."}</p>
      </Card>

      <HealthCard bot={bot} onChange={onChange} />

      <Card>
        <CardHeader>
          <CardTitle>Delivery</CardTitle>
          <OpenLink to="delivery" label="Manage" onOpen={open} />
        </CardHeader>
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-[var(--muted)]">Updates</dt>
            <dd>{bot.webhook?.url ? <Badge variant="primary">Webhook</Badge> : <Badge variant="default">Polling</Badge>}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-[var(--muted)]">Monitoring</dt>
            <dd>{bot.monitorEnabled ? <Badge variant="success">On</Badge> : <Badge variant="default">Off</Badge>}</dd>
          </div>
          {bot.webhook?.url && (
            <div className="flex items-center justify-between gap-2">
              <dt className="text-[var(--muted)]">Pending</dt>
              <dd className="tabular-nums">{bot.webhook.pending_update_count}</dd>
            </div>
          )}
          {bot.webhook?.last_error_message && <p className="text-xs text-[var(--danger)]">{bot.webhook.last_error_message}</p>}
        </dl>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Last 14 days</CardTitle>
          <OpenLink to="stats" label="All stats" onOpen={open} />
        </CardHeader>
        <Body result={stats}>
          {(s) => {
            const max = Math.max(1, ...s.perDay.map((d) => d.incoming + d.outgoing));
            return (
              <div className="grid gap-4 sm:grid-cols-[1fr_minmax(0,1.4fr)]">
                <dl className="grid grid-cols-3 gap-3 sm:grid-cols-2">
                  <Tile label="Users" value={s.users.total} />
                  <Tile label="New (7d)" value={s.users.newLast7d} />
                  <Tile label="Active (7d)" value={s.users.activeLast7d} />
                  <Tile label="Received" value={s.messages.incoming} />
                </dl>
                <div className="flex h-24 items-end gap-1" role="img" aria-label="Messages per day, last 14 days (UTC)">
                  {s.perDay.map((d) => (
                    <div
                      key={d.date}
                      title={`${d.date}: ${d.incoming} received, ${d.outgoing} sent`}
                      className="flex h-full min-w-0 flex-1 flex-col justify-end"
                    >
                      <div
                        className="w-full rounded-t-[3px] bg-[var(--primary)]"
                        style={{ height: `${((d.incoming + d.outgoing) / max) * 100}%`, minHeight: d.incoming + d.outgoing ? 2 : 1 }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          }}
        </Body>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Commands</CardTitle>
          <OpenLink to="commands" label="Edit" onOpen={open} />
        </CardHeader>
        {bot.commands && bot.commands.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {bot.commands.slice(0, 12).map((c) => (
              <li key={c.command}>
                <Badge variant="default" title={c.description}>
                  /{c.command}
                </Badge>
              </li>
            ))}
            {bot.commands.length > 12 && <li className="text-xs text-[var(--muted)]">+{bot.commands.length - 12} more</li>}
          </ul>
        ) : (
          <p className="text-sm text-[var(--muted)]">No commands set.</p>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Automation</CardTitle>
          <OpenLink to="automation" label="Rules" onOpen={open} />
        </CardHeader>
        <Body result={rules}>
          {({ rules: list }) =>
            list.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No auto-reply rules yet.</p>
            ) : (
              <>
                <p className="mb-2 text-xs text-[var(--muted)]">
                  {list.filter((r) => r.enabled).length} of {list.length} enabled
                </p>
                <ul className="space-y-1.5 text-sm">
                  {list
                    .slice()
                    .sort((a, b) => b.hits - a.hits)
                    .slice(0, 5)
                    .map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-2">
                        <span className={`truncate ${r.enabled ? "" : "text-[var(--muted)] line-through"}`}>
                          {r.matchType === "command" ? `/${r.pattern}` : r.pattern}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-[var(--muted)]">{r.hits}×</span>
                      </li>
                    ))}
                </ul>
              </>
            )
          }
        </Body>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Recent conversations</CardTitle>
          <OpenLink to="messages" label="Open messages" onOpen={open} />
        </CardHeader>
        <Body result={messages}>
          {({ conversations }) =>
            conversations.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                {bot.monitorEnabled ? "No messages yet." : "Turn monitoring on (header) to start collecting messages."}
              </p>
            ) : (
              <ul className="divide-y divide-[var(--card-border)]">
                {conversations.slice(0, 5).map((c) => (
                  <li key={c.key}>
                    <button
                      type="button"
                      onClick={() => onOpen("messages", c.chatId)}
                      className="flex w-full items-center gap-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <span className="w-32 shrink-0 truncate font-medium">{c.name}</span>
                      <span className="min-w-0 flex-1 truncate text-[var(--muted)]">{c.lastText ?? "(no text)"}</span>
                      <span className="shrink-0 text-xs text-[var(--muted)]">{timeAgo(c.lastAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          }
        </Body>
      </Card>
    </div>
  );
}
