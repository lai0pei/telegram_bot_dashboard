"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { apiFetch } from "@/lib/api-client";
import { KIND_LABELS, type ChatDetail } from "./types";

export function InfoTab({ chat, onChange }: { chat: ChatDetail; onChange: () => void }) {
  const [regenerating, setRegenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      await apiFetch(`/api/chats/${chat.id}/invite`, { method: "POST" });
      toast.success("Invite link regenerated. The old one no longer works.");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to regenerate invite link.");
    } finally {
      setRegenerating(false);
    }
  }

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
        <h3 className="mb-3 text-sm font-semibold">IDs</h3>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <Field label="Bot API chat ID" value={chat.botApiId} mono copy />
          <Field label="Telegram ID" value={chat.telegramId} mono copy />
        </dl>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Use the Bot API chat ID as <code>chat_id</code> when a bot sends to this {KIND_LABELS[chat.kind].toLowerCase()}.
        </p>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold">Details</h3>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Type" value={KIND_LABELS[chat.kind]} />
          <Field label="Public username" value={chat.username ? `@${chat.username}` : "— (private)"} />
          <Field label="Members" value={chat.participantsCount?.toString() ?? "—"} />
          <Field label="Your role" value={chat.isCreator ? "Owner" : "Admin"} />
        </dl>
      </Card>

      <Card>
        <h3 className="mb-2 text-sm font-semibold">Description</h3>
        <p className="whitespace-pre-wrap text-sm text-[var(--muted)]">{chat.about || "No description set."}</p>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold">Invite link</h3>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="flex-1 truncate rounded-md bg-black/5 px-3 py-2 text-sm dark:bg-white/5">
            {chat.inviteLink ?? "No invite link yet."}
          </code>
          <div className="flex gap-2">
            {chat.inviteLink && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(chat.inviteLink!);
                  toast.success("Copied.");
                }}
              >
                Copy
              </Button>
            )}
            {chat.canInviteUsers && (
              <Button size="sm" variant="outline" onClick={handleRegenerate} loading={regenerating}>
                {chat.inviteLink ? "Regenerate" : "Create"}
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Button variant="outline" size="sm" onClick={handleRefresh} loading={refreshing}>
        {!refreshing && <RefreshCw className="h-3.5 w-3.5" />}
        Refresh
      </Button>
    </div>
  );
}

function Field({ label, value, mono, copy }: { label: string; value: string; mono?: boolean; copy?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className={`flex items-center gap-1 font-medium ${mono ? "font-mono" : ""}`}>
        <span className="truncate">{value}</span>
        {copy && <CopyButton value={value} />}
      </dd>
    </div>
  );
}
