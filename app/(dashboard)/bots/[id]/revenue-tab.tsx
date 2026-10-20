"use client";

import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-client";
import type { StarTransaction } from "@/lib/botapi";
import type { BotDetail } from "./types";

interface StarsData {
  balance: number;
  transactions: StarTransaction[];
  truncated: boolean;
}

/** Who a transaction was with: the buyer for incoming payments, the recipient for outgoing ones. */
function partnerLabel(tx: StarTransaction): string {
  const partner = tx.source ?? tx.receiver;
  if (!partner) return "—";
  if (partner.user) return partner.user.username ? `@${partner.user.username}` : partner.user.first_name;
  return partner.type.replace(/_/g, " ");
}

export function RevenueTab({ bot }: { bot: BotDetail }) {
  const [data, setData] = useState<StarsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<StarsData>(`/api/bots/${bot.id}/stars`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load Stars."));
  }, [bot.id]);

  if (!bot.hasToken) return <Card className="text-sm">Fetch the bot&apos;s token first to see its Stars.</Card>;
  if (error) return <Card className="text-sm text-[var(--danger)]">{error}</Card>;
  if (!data) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Star className="h-4 w-4" aria-hidden />
            Stars balance
          </CardTitle>
        </CardHeader>
        <p className="text-3xl font-semibold tabular-nums">{data.balance.toLocaleString()}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Earned from invoices paid in Telegram Stars. Withdraw or spend them from the bot&apos;s Stars page in Telegram.
        </p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent transactions</CardTitle>
        </CardHeader>
        {data.transactions.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No transactions yet.</p>
        ) : (
          <ul className="divide-y divide-black/5 text-sm dark:divide-white/10">
            {data.transactions.map((tx) => (
              <li key={`${tx.id}-${tx.date}-${tx.source ? "in" : "out"}`} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{partnerLabel(tx)}</div>
                  <div className="truncate text-xs text-[var(--muted)]">
                    {new Date(tx.date * 1000).toLocaleString()}
                    {tx.source?.invoice_payload && ` · ${tx.source.invoice_payload}`}
                  </div>
                </div>
                <Badge variant={tx.source ? "success" : "default"} className="tabular-nums">
                  {tx.source ? "+" : "−"}
                  {tx.amount.toLocaleString()} ★
                </Badge>
              </li>
            ))}
          </ul>
        )}
        {data.truncated && (
          <p className="mt-2 text-xs text-[var(--muted)]">
            This bot has more than 1,000 transactions; only the earliest ones could be loaded, so the newest may be missing.
          </p>
        )}
      </Card>
    </div>
  );
}
