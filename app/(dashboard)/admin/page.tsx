"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiFetch } from "@/lib/api-client";
import { timeAgo } from "@/lib/time";
import type { AdminUserRow, AdminUsersOverview } from "@/lib/admin-users";
import { FilterChips, SearchInput, matchesQuery, useSlashToSearch } from "../list-toolbar";

type Filter = "all" | "active7d" | "inactive" | "revoked";

const DAY_MS = 24 * 60 * 60 * 1000;

function isActiveWithin(user: AdminUserRow, ms: number): boolean {
  return user.lastActiveAt !== null && Date.now() - user.lastActiveAt <= ms;
}

function accountLabel(a: AdminUserRow["accounts"][number]): string {
  return a.username ? `@${a.username}` : a.firstName || a.telegramId;
}

export default function AdminPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<AdminUsersOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  useSlashToSearch();

  useEffect(() => {
    apiFetch<AdminUsersOverview>("/api/admin/users")
      .then(setOverview)
      .catch((err: unknown) => {
        // Only a definite "you are not the admin" leaves the page: a slow or failed load must not bounce a real admin.
        if (err instanceof ApiError && err.body.code === "NOT_ADMIN") router.replace("/");
        else setError(err instanceof Error ? err.message : "Couldn't load users.");
      });
  }, [router]);

  const rows = useMemo(() => {
    const matches: Record<Filter, (u: AdminUserRow) => boolean> = {
      all: () => true,
      active7d: (u) => isActiveWithin(u, 7 * DAY_MS),
      inactive: (u) => !isActiveWithin(u, 7 * DAY_MS),
      revoked: (u) => u.accounts.some((a) => a.revoked),
    };
    return (overview?.users ?? []).filter(
      (u) => matches[filter](u) && matchesQuery(query, u.name, ...u.accounts.flatMap((a) => [a.username, a.firstName, a.telegramId]))
    );
  }, [overview, filter, query]);

  if (error) return <p className="text-sm text-[var(--danger)]">{error}</p>;

  if (!overview) {
    return (
      <div className="space-y-6">
        <h1 className="text-lg font-semibold">Admin</h1>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { totals } = overview;
  const users = overview.users;
  const options: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "All", count: users.length },
    { value: "active7d", label: "Active 7d", count: totals.activeLast7d },
    { value: "inactive", label: "Inactive", count: users.length - totals.activeLast7d },
    { value: "revoked", label: "Revoked session", count: users.filter((u) => u.accounts.some((a) => a.revoked)).length },
  ];
  const tiles: { label: string; value: number }[] = [
    { label: "Users", value: totals.users },
    { label: "Active 24h", value: totals.activeLast24h },
    { label: "Active 7d", value: totals.activeLast7d },
    { label: "Telegram accounts", value: totals.accounts },
    { label: "Bots", value: totals.bots },
    { label: "Monitored bots", value: totals.monitoredBots },
    { label: "Channels & groups", value: totals.chats },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Admin</h1>
        <p className="text-sm text-[var(--muted)]">Everyone using this dashboard. Read-only.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {tiles.map((t) => (
          <Card key={t.label} className="p-4">
            <div className="text-2xl font-semibold tabular-nums">{t.value}</div>
            <div className="text-xs text-[var(--muted)]">{t.label}</div>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={query} onChange={setQuery} placeholder="Search users — press /" />
        <FilterChips options={options} value={filter} onChange={setFilter} />
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-[var(--card-border)] text-left text-xs text-[var(--muted)]">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Telegram accounts</th>
              <th className="px-4 py-3 text-right font-medium">Bots</th>
              <th className="px-4 py-3 text-right font-medium">Channels &amp; groups</th>
              <th className="px-4 py-3 font-medium">Last seen</th>
              <th className="px-4 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b border-[var(--card-border)] last:border-0 align-top">
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 font-medium">
                    {u.name}
                    {u.isAdmin && <Badge variant="primary">Admin</Badge>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {u.accounts.length === 0 ? (
                    <span className="text-[var(--muted)]">None</span>
                  ) : (
                    <ul className="space-y-1">
                      {u.accounts.map((a) => (
                        <li key={a.telegramId} className="flex flex-wrap items-center gap-2">
                          <span>{accountLabel(a)}</span>
                          <span className="text-xs text-[var(--muted)]">{a.telegramId}</span>
                          {a.revoked && <Badge variant="danger">Session ended</Badge>}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {u.bots}
                  {u.monitoredBots > 0 && <span className="ml-1 text-xs text-[var(--muted)]">({u.monitoredBots} monitored)</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{u.chats}</td>
                <td className="px-4 py-3 text-[var(--muted)]">{u.lastActiveAt ? timeAgo(u.lastActiveAt) : "Never"}</td>
                <td className="px-4 py-3 text-[var(--muted)]">{new Date(u.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--muted)]">
                  No users match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
