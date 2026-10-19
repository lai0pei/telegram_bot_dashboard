"use client";

import { Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { BotDetail } from "./types";

export function InfoTab({
  bot,
  onChange,
  onFetchToken,
  fetchingToken,
}: {
  bot: BotDetail;
  onChange: () => void;
  onFetchToken: () => void;
  fetchingToken: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const token = bot.token;

  async function handleRefresh() {
    setRefreshing(true);
    try {
      onChange();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-3 text-sm font-semibold">Bot token</h3>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="flex-1 truncate rounded-md bg-black/5 px-3 py-2 text-sm dark:bg-white/5">
            {token && revealed ? token : "••••••••••••••••••••••••"}
          </code>
          <div className="flex gap-2">
            {!token ? (
              <Button size="sm" variant="outline" onClick={onFetchToken} loading={fetchingToken}>
                Fetch from BotFather
              </Button>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => setRevealed((r) => !r)}>
                  {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {revealed ? "Hide" : "Reveal"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(token);
                    toast.success("Copied.");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </Button>
              </>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Anyone with this token has full control of the bot. Keep it secret.
        </p>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold">Details</h3>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Telegram ID" value={bot.info?.id?.toString() ?? "—"} />
          <Field label="Username" value={`@${bot.username}`} />
          <Field label="Name" value={bot.name || bot.firstName} />
          <Field label="Short description" value={bot.shortDescription || "—"} />
        </dl>
      </Card>

      <Card>
        <h3 className="mb-2 text-sm font-semibold">Description</h3>
        <p className="text-sm text-[var(--muted)]">{bot.description || "No description set."}</p>
      </Card>

      <Button variant="outline" size="sm" onClick={handleRefresh} loading={refreshing}>
        {!refreshing && <RefreshCw className="h-3.5 w-3.5" />}
        Refresh
      </Button>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}
