"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import type { BotDetail } from "./types";

interface BotUsername {
  username: string;
  active: boolean;
  editable: boolean;
}

/** The bot's usernames: the regular one plus collectible ones, which can be switched off/on and reordered. */
export function UsernamesCard({ bot }: { bot: BotDetail }) {
  const [usernames, setUsernames] = useState<BotUsername[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setUsernames((await apiFetch<{ usernames: BotUsername[] }>(`/api/bots/${bot.id}/usernames`)).usernames);
    } catch {
      setUsernames([]);
    }
  }, [bot.id]);

  useEffect(() => {
    // Intentional: fetch-on-mount into local state, not state synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      setUsernames((await apiFetch<{ usernames: BotUsername[] }>(`/api/bots/${bot.id}/usernames`, { method: "PATCH", body })).usernames);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update the usernames.");
    } finally {
      setBusy(false);
    }
  }

  function move(index: number, delta: -1 | 1) {
    const active = (usernames ?? []).filter((u) => u.active).map((u) => u.username);
    const from = active.indexOf(usernames![index].username);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= active.length) return;
    [active[from], active[to]] = [active[to], active[from]];
    void patch({ order: active });
  }

  // A bot with only its regular username has nothing to manage here.
  if (usernames !== null && usernames.length <= 1) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usernames</CardTitle>
        <span className="text-xs text-[var(--muted)]">The first active username is the one Telegram shows.</span>
      </CardHeader>
      {usernames === null ? (
        <Skeleton className="h-16" />
      ) : (
        <ul className="divide-y divide-[var(--card-border)]">
          {usernames.map((u, i) => (
            <li key={u.username} className="flex items-center gap-3 py-2">
              <Switch
                checked={u.active}
                disabled={busy || u.editable}
                onCheckedChange={(active) => void patch({ username: u.username, active })}
                aria-label={`${u.username} active`}
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                @{u.username}
                {u.editable && <span className="ml-2 text-xs text-[var(--muted)]">main (change it in BotFather)</span>}
              </span>
              {u.active && (
                <>
                  <Button variant="ghost" size="icon" disabled={busy} onClick={() => move(i, -1)} aria-label="Move up">
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" disabled={busy} onClick={() => move(i, 1)} aria-label="Move down">
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
