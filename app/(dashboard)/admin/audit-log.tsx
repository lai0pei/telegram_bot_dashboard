"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-client";
import { timeAgo } from "@/lib/time";
import type { AdminActionDto } from "@/lib/admin-actions";

const LABELS: Record<AdminActionDto["action"], string> = {
  sign_out: "signed out",
  suspend: "suspended",
  unsuspend: "unsuspended",
  delete_user: "deleted",
  update_access: "changed",
};

/** The master admin's own trail: who did what to whom. Append-only on the server; `refreshKey` reloads it after an action. */
export function AuditLog({ refreshKey }: { refreshKey: number }) {
  const [actions, setActions] = useState<AdminActionDto[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    apiFetch<{ actions: AdminActionDto[] }>("/api/admin/audit")
      .then((r) => {
        setActions(r.actions);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [refreshKey]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit log</CardTitle>
      </CardHeader>
      {failed ? (
        <p className="text-sm text-[var(--danger)]">Couldn&apos;t load the audit log.</p>
      ) : actions === null ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : actions.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Nothing yet. Sign-outs, suspensions and deletions appear here.</p>
      ) : (
        <ul className="divide-y divide-[var(--card-border)] text-sm">
          {actions.map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
              <span>
                <span className="font-medium">{a.adminName}</span> {LABELS[a.action]}{" "}
                <span className="font-medium">{a.targetName}</span>
                {a.detail && <span className="block text-xs text-[var(--muted)]">{a.detail}</span>}
              </span>
              <span className="text-xs text-[var(--muted)]" title={new Date(a.at).toLocaleString()}>
                {timeAgo(a.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
