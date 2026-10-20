"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-client";
import type { BotDetail, BotStatsData } from "./types";

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
      <p className="text-xs text-[var(--muted)]">{label}</p>
    </div>
  );
}

const CHART_HEIGHT = 140;

export function StatsTab({ bot }: { bot: BotDetail }) {
  const [stats, setStats] = useState<BotStatsData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    apiFetch<BotStatsData>(`/api/bots/${bot.id}/stats`)
      .then(setStats)
      .catch(() => setFailed(true));
  }, [bot.id]);

  if (failed) return <Card className="text-sm text-[var(--danger)]">Couldn&apos;t load stats.</Card>;
  if (!stats) return <Skeleton className="h-64" />;

  const max = Math.max(1, ...stats.perDay.map((d) => d.incoming + d.outgoing));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Tile label="Users" value={stats.users.total} />
          <Tile label="New (7 days)" value={stats.users.newLast7d} />
          <Tile label="Active (7 days)" value={stats.users.activeLast7d} />
          <Tile label="Active chats (7 days)" value={stats.messages.activeChatsLast7d} />
          <Tile label="Messages received" value={stats.messages.incoming} />
          <Tile label="Messages sent" value={stats.messages.outgoing} />
          <Tile label="Groups & channels (member)" value={stats.chats.members} />
          <Tile label="Groups & channels (admin)" value={stats.chats.administrator} />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Messages per day</CardTitle>
          <div className="flex items-center gap-4 text-xs text-[var(--muted)]">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[var(--primary)]" aria-hidden /> Received
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[var(--muted)]" aria-hidden /> Sent
            </span>
          </div>
        </CardHeader>
        <div className="flex items-end gap-1.5" style={{ height: CHART_HEIGHT }} role="img" aria-label="Messages per day, last 14 days (UTC)">
          {stats.perDay.map((d) => {
            const total = d.incoming + d.outgoing;
            return (
              <div
                key={d.date}
                title={`${d.date} (UTC): ${d.incoming} received, ${d.outgoing} sent`}
                className="flex h-full min-w-0 flex-1 flex-col justify-end gap-[2px]"
              >
                {d.outgoing > 0 && (
                  <div
                    className="w-full rounded-t-[4px] bg-[var(--muted)]"
                    style={{ height: `${(d.outgoing / max) * 100}%`, minHeight: 2 }}
                  />
                )}
                {d.incoming > 0 && (
                  <div
                    className={`w-full bg-[var(--primary)] ${d.outgoing === 0 ? "rounded-t-[4px]" : ""}`}
                    style={{ height: `${(d.incoming / max) * 100}%`, minHeight: 2 }}
                  />
                )}
                {total === 0 && <div className="h-px w-full bg-[var(--card-border)]" />}
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-[var(--muted)]">
          <span>{stats.perDay[0]?.date}</span>
          <span>{stats.perDay[stats.perDay.length - 1]?.date}</span>
        </div>
        <details className="mt-4 text-xs">
          <summary className="cursor-pointer text-[var(--muted)]">Show as table</summary>
          <table className="mt-2 w-full tabular-nums">
            <thead className="text-left text-[var(--muted)]">
              <tr>
                <th className="py-1 font-medium">Day (UTC)</th>
                <th className="py-1 text-right font-medium">Received</th>
                <th className="py-1 text-right font-medium">Sent</th>
              </tr>
            </thead>
            <tbody>
              {stats.perDay.map((d) => (
                <tr key={d.date} className="border-t border-[var(--card-border)]">
                  <td className="py-1">{d.date}</td>
                  <td className="py-1 text-right">{d.incoming}</td>
                  <td className="py-1 text-right">{d.outgoing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Card>

      <p className="text-xs text-[var(--muted)]">
        Counts come from this dashboard&apos;s local copy. Received messages are only recorded while monitoring is on
        {stats.monitorEnabled ? "" : " (it is currently off)"}; sent messages only include those sent from the
        dashboard, not replies from your bot&apos;s own code.
      </p>
    </div>
  );
}
