"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiFetch } from "@/lib/api-client";
import { timeAgo } from "@/lib/time";
import type { ErrorDto } from "@/lib/error-log";

type Status = "open" | "resolved" | "all";
type Since = "1h" | "24h" | "7d" | "30d" | "all";

const SELECT_CLASS =
  "h-9 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]";

/** Server and browser errors collected by lib/error-log.ts, with a one-click prompt for an LLM. */
export function ErrorsTab() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("open");
  const [since, setSince] = useState<Since>("7d");
  const [errors, setErrors] = useState<ErrorDto[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [resolving, setResolving] = useState<number | null>(null);

  const query = `status=${status}&since=${since}`;

  const onFailure = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof ApiError && err.body.code === "NOT_ADMIN") router.replace("/");
      else return err instanceof Error ? err.message : fallback;
      return null;
    },
    [router]
  );

  const load = useCallback(() => {
    apiFetch<{ errors: ErrorDto[] }>(`/api/admin/errors?${query}`)
      .then((r) => {
        setErrors(r.errors);
        setFailed(null);
      })
      .catch((err: unknown) => setFailed(onFailure(err, "Couldn't load the errors.")));
  }, [query, onFailure]);

  useEffect(() => {
    load();
  }, [load]);

  async function copyForLlm() {
    setCopying(true);
    try {
      const res = await fetch(`/api/admin/errors?${query}&format=markdown`, { cache: "no-store" });
      if (!res.ok) throw new Error("Couldn't build the export.");
      await navigator.clipboard.writeText(await res.text());
      toast.success("Copied. Paste it into your LLM.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't copy.");
    } finally {
      setCopying(false);
    }
  }

  async function setResolved(e: ErrorDto, resolved: boolean) {
    setResolving(e.id);
    try {
      await apiFetch(`/api/admin/errors/${e.id}`, { method: "PATCH", body: { resolved } });
      load();
    } catch (err) {
      const message = onFailure(err, "Couldn't update that.");
      if (message) toast.error(message);
    } finally {
      setResolving(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select className={SELECT_CLASS} value={status} onChange={(e) => setStatus(e.target.value as Status)} aria-label="Status">
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
          <select className={SELECT_CLASS} value={since} onChange={(e) => setSince(e.target.value as Since)} aria-label="Last seen">
            <option value="1h">Last hour</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>
        </div>
        <Button loading={copying} disabled={!errors || errors.length === 0} onClick={() => void copyForLlm()}>
          Copy for LLM
        </Button>
      </div>

      {failed ? (
        <p className="text-sm text-[var(--danger)]">{failed}</p>
      ) : errors === null ? (
        <Skeleton className="h-48 w-full" />
      ) : errors.length === 0 ? (
        <Card className="text-sm text-[var(--muted)]">No errors here. Anything the server or a browser reports will show up in this list.</Card>
      ) : (
        <div className="space-y-2">
          {errors.map((e) => (
            <Card key={e.id} className="p-0">
              <details className="group">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <Badge variant={e.resolved ? "success" : "danger"}>{e.source}</Badge>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium" title={`${e.what}: ${e.message}`}>
                    {e.what} <span className="font-normal text-[var(--muted)]">{e.errorName}: {e.message}</span>
                  </span>
                  <span className="text-xs tabular-nums text-[var(--muted)]">×{e.count}</span>
                  <span className="text-xs text-[var(--muted)]" title={new Date(e.lastSeenAt).toLocaleString()}>
                    {timeAgo(e.lastSeenAt)}
                  </span>
                </summary>
                <div className="space-y-3 border-t border-[var(--card-border)] px-4 py-3 text-sm">
                  <p className="text-xs text-[var(--muted)]">
                    First seen {new Date(e.firstSeenAt).toLocaleString()} · last seen {new Date(e.lastSeenAt).toLocaleString()}
                  </p>
                  <p className="break-words">{e.message}</p>
                  {e.context && (
                    <pre className="overflow-x-auto rounded-lg bg-black/5 p-3 text-xs dark:bg-white/5">{JSON.stringify(e.context, null, 2)}</pre>
                  )}
                  {e.stack && <pre className="max-h-72 overflow-auto rounded-lg bg-black/5 p-3 text-xs dark:bg-white/5">{e.stack}</pre>}
                  <Button
                    size="sm"
                    variant="outline"
                    loading={resolving === e.id}
                    disabled={resolving !== null}
                    onClick={() => void setResolved(e, !e.resolved)}
                  >
                    {e.resolved ? "Reopen" : "Mark resolved"}
                  </Button>
                </div>
              </details>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
