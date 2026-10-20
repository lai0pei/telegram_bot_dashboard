"use client";

import { ArrowRightLeft, KeyRound, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import { validateTelegramUsername } from "@/lib/validation";
import { cn } from "@/lib/utils";
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
  const confirmed = confirmText === bot.username;
  const [recipient, setRecipient] = useState("");
  const [twoFa, setTwoFa] = useState("");
  const [transferConfirm, setTransferConfirm] = useState("");
  const [transferring, setTransferring] = useState(false);
  const recipientError = recipient ? validateTelegramUsername(recipient) : null;
  const canTransfer = Boolean(recipient && twoFa && transferConfirm === bot.username) && !recipientError;

  async function handleTransfer() {
    setTransferring(true);
    try {
      await apiFetch(`/api/bots/${bot.id}/transfer`, { body: { recipient, password: twoFa, confirm: transferConfirm } });
      toast.success(`@${bot.username} was transferred to ${recipient}.`);
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to transfer the bot.");
    } finally {
      setTwoFa("");
      setTransferring(false);
    }
  }

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
        <Button variant="outline" onClick={handleRevoke} loading={revoking}>
          <KeyRound className="h-3.5 w-3.5" />
          Revoke token
        </Button>
      </Card>

      <Card className="border-[var(--danger)]/50">
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-[var(--danger)]">
          <ArrowRightLeft className="h-4 w-4" />
          Transfer ownership
        </h3>
        <p className="mb-3 text-sm text-[var(--muted)]">
          Hands @{bot.username} to another Telegram user through BotFather. You lose access to it and it disappears from this dashboard. Telegram
          asks for your <strong>2FA password</strong> to confirm (used once for this request, never stored). This flow has not been verified against the real
          BotFather yet: if it replies with something unexpected, nothing is sent and the reply is shown. Type <strong>{bot.username}</strong> to confirm.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="New owner's @username" aria-label="New owner" autoComplete="off" />
          <Input
            type="password"
            value={twoFa}
            onChange={(e) => setTwoFa(e.target.value)}
            placeholder="Your 2FA password"
            aria-label="2FA password"
            autoComplete="off"
          />
          <Input value={transferConfirm} onChange={(e) => setTransferConfirm(e.target.value)} placeholder={bot.username} aria-label="Confirm bot username" autoComplete="off" />
        </div>
        {recipientError && <p className="mt-2 text-xs text-[var(--danger)]">{recipientError}</p>}
        <Button variant="danger" className="mt-3" onClick={handleTransfer} loading={transferring} disabled={!canTransfer}>
          <ArrowRightLeft className="h-3.5 w-3.5" />
          Transfer bot
        </Button>
      </Card>

      <Card className="border-[var(--danger)]/50">
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-[var(--danger)]">
          <Trash2 className="h-4 w-4" />
          Delete this bot
        </h3>
        <p className="mb-3 text-sm text-[var(--muted)]">
          Permanently deletes @{bot.username} via BotFather. This cannot be undone and the username becomes
          available for anyone to claim. Type <strong>{bot.username}</strong> to confirm.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={bot.username}
            className="sm:max-w-xs"
          />
          <Button
            variant="danger"
            onClick={handleDelete}
            loading={deleting}
            disabled={!confirmed}
            className={cn(confirmed && !deleting && "animate-pulse motion-reduce:animate-none")}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete bot
          </Button>
        </div>
      </Card>
    </div>
  );
}
