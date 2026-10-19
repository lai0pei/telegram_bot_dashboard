"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import type { BotDetail } from "./types";

export function DangerTab({
  bot,
  onDeleted,
  onTokenChanged,
}: {
  bot: BotDetail;
  onDeleted: () => void;
  onTokenChanged: () => void;
}) {
  const [revoking, setRevoking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  async function handleRevoke() {
    setRevoking(true);
    try {
      await apiFetch(`/api/bots/${bot.id}/revoke`, { method: "POST" });
      toast.success("Token revoked. A new one was issued.");
      onTokenChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke token.");
    } finally {
      setRevoking(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await apiFetch(`/api/bots/${bot.id}`, { method: "DELETE" });
      toast.success("Bot deleted.");
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete bot.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-1 text-sm font-semibold">Revoke token</h3>
        <p className="mb-3 text-sm text-[var(--muted)]">
          Immediately invalidates the current token and issues a new one. Anything using the old token (a deployed
          bot process, a webhook) will stop working until updated.
        </p>
        <Button variant="outline" onClick={handleRevoke} disabled={revoking}>
          {revoking ? "Revoking…" : "Revoke token"}
        </Button>
      </Card>

      <Card className="border-[var(--danger)]/40">
        <h3 className="mb-1 text-sm font-semibold text-[var(--danger)]">Delete this bot</h3>
        <p className="mb-3 text-sm text-[var(--muted)]">
          Permanently deletes @{bot.username} via BotFather. This cannot be undone and the username becomes
          available for anyone to claim. Type <strong>{bot.username}</strong> to confirm.
        </p>
        <div className="flex gap-2">
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={bot.username}
            className="max-w-xs"
          />
          <Button variant="danger" onClick={handleDelete} disabled={deleting || confirmText !== bot.username}>
            {deleting ? "Deleting…" : "Delete bot"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
