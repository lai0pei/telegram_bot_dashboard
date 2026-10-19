"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  KeyRound,
  Radio,
  ShieldAlert,
  Webhook,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-client";
import { useAccounts } from "./accounts-context";

interface AttentionItem {
  kind: "session_revoked" | "bot_no_token" | "bot_webhook_error" | "bot_poller_stalled" | "unanswered";
  accountId: string;
  accountLabel: string;
  botId?: number;
  botUsername?: string;
  title: string;
  detail: string;
  href: string;
  since: number;
}

const ICONS: Record<AttentionItem["kind"], typeof AlertTriangle> = {
  session_revoked: ShieldAlert,
  bot_no_token: KeyRound,
  bot_webhook_error: Webhook,
  bot_poller_stalled: Radio,
  unanswered: Clock,
};

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function timeAgo(ms: number): string {
  const seconds = Math.round((ms - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

/**
 * Everything across all of the user's linked Telegram accounts that could
 * use a look — revoked sessions, broken tokens/webhooks, a stalled poller,
 * conversations waiting on a reply — so the owner doesn't have to open every
 * bot and chat to find out. Clicking an item from a non-active account
 * switches to it first (same flow as the account switcher).
 */
export function AttentionPanel() {
  const router = useRouter();
  const { accounts, active, reload } = useAccounts();
  const [items, setItems] = useState<AttentionItem[] | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ items: AttentionItem[] }>("/api/attention")
      .then((res) => setItems(res.items))
      .catch(() => setItems([]));
  }, []);

  async function go(item: AttentionItem) {
    if (switching) return;
    if (item.accountId !== active?.id) {
      setSwitching(item.accountId);
      try {
        await apiFetch(`/api/telegram-accounts/${item.accountId}/activate`, { method: "POST" });
        await reload();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to switch accounts.");
        setSwitching(null);
        return;
      }
      setSwitching(null);
    }
    router.push(item.href);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Needs attention</CardTitle>
        {items !== null && items.length > 0 && (
          <span className="text-xs text-[var(--muted)]">Across {accounts?.length ?? "all"} linked accounts</span>
        )}
      </CardHeader>

      {items === null ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-2 py-4 text-sm text-[var(--success)]">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          All good — nothing needs your attention.
        </div>
      ) : (
        <ul className="-mx-2 divide-y divide-[var(--card-border)]">
          {items.map((item, i) => {
            const Icon = ICONS[item.kind];
            return (
              <li key={`${item.kind}-${item.accountId}-${item.botId ?? ""}-${i}`}>
                <button
                  type="button"
                  onClick={() => go(item)}
                  disabled={switching !== null}
                  className="flex w-full items-start gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-black/5 disabled:opacity-60 dark:hover:bg-white/5"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--danger)]/10 text-[var(--danger)]">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{item.title}</span>
                      <span className="shrink-0 text-xs text-[var(--muted)]">{timeAgo(item.since)}</span>
                    </span>
                    <span className="block truncate text-sm text-[var(--muted)]">
                      {item.accountLabel} · {item.detail}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
