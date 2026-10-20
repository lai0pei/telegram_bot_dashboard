"use client";

import { Info } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-client";
import type { AccountLimits, LimitItem } from "@/lib/limits";
import { cn } from "@/lib/utils";

const NEAR_LIMIT = 0.9;

const LINKS: Record<LimitItem["key"], string> = {
  bots: "/bots",
  channels: "/chats?filter=channel",
  groups: "/chats?filter=group",
  publicLinks: "/chats",
};

/** Bots / channels / groups / public links used against Telegram's limits for the active account. */
export function LimitsCard() {
  const [limits, setLimits] = useState<AccountLimits | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Separate from /api/overview: the limits come from Telegram (cached server-side for an hour).
    apiFetch<AccountLimits>("/api/limits")
      .then(setLimits)
      .catch(() => setFailed(true));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage &amp; limits</CardTitle>
        {limits?.premium && <Badge variant="primary">Telegram Premium</Badge>}
      </CardHeader>
      {failed ? (
        <p className="text-sm text-[var(--muted)]">Couldn&apos;t load your limits from Telegram right now.</p>
      ) : limits === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {limits.items.map((item) => (
              <LimitMeter key={item.key} item={item} />
            ))}
          </div>
          <p className="mt-4 flex items-start gap-1.5 text-xs text-[var(--muted)]">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            Counts are chats you own or admin, as of the last sync (open Channels &amp; groups to refresh). Limits marked
            ~ are the usual values; Telegram didn&apos;t report them for your account.
          </p>
        </>
      )}
    </Card>
  );
}

function LimitMeter({ item }: { item: LimitItem }) {
  const ratio = item.limit ? item.used / item.limit : 0;
  const remaining = item.limit !== null ? Math.max(item.limit - item.used, 0) : null;
  return (
    <Link href={LINKS[item.key]} title={item.hint} className="block space-y-1.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate font-medium">{item.label}</span>
        <span className="shrink-0 tabular-nums text-[var(--muted)]">
          {item.used}
          {item.limit !== null && ` / ${item.exact ? "" : "~"}${item.limit}`}
        </span>
      </div>
      {item.limit !== null ? (
        <div
          role="progressbar"
          aria-label={`${item.label} used`}
          aria-valuemin={0}
          aria-valuemax={item.limit}
          aria-valuenow={Math.min(item.used, item.limit)}
          className="h-1.5 overflow-hidden rounded-full bg-[var(--card-border)]"
        >
          <div
            className={cn("h-full rounded-full", ratio >= NEAR_LIMIT ? "bg-[var(--danger)]" : "bg-[var(--primary)]")}
            style={{ width: `${Math.min(ratio, 1) * 100}%` }}
          />
        </div>
      ) : (
        <div className="h-1.5 rounded-full bg-[var(--card-border)]/50" aria-hidden />
      )}
      <p className={cn("text-xs", ratio >= NEAR_LIMIT ? "text-[var(--danger)]" : "text-[var(--muted)]")}>
        {remaining === null ? "No per-account cap" : remaining === 0 ? "Limit reached" : `${remaining} left`}
      </p>
    </Link>
  );
}
