"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { KIND_LABELS, type ChatDetail } from "./types";

export function DangerTab({ chat, onDeleted }: { chat: ChatDetail; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const label = KIND_LABELS[chat.kind].toLowerCase();
  const confirmed = confirmText === chat.title;

  async function handleDelete() {
    setDeleting(true);
    try {
      await apiFetch(`/api/chats/${chat.id}`, { method: "DELETE" });
      toast.success(`${KIND_LABELS[chat.kind]} deleted.`);
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to delete ${label}.`);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="border-[var(--danger)]/50">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-[var(--danger)]">
        <Trash2 className="h-4 w-4" />
        Delete this {label}
      </h3>
      <p className="mb-3 text-sm text-[var(--muted)]">
        Permanently deletes &quot;{chat.title}&quot; on Telegram for all members, including its message history. This
        cannot be undone. Type <strong>{chat.title}</strong> to confirm.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={chat.title}
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
          Delete {label}
        </Button>
      </div>
    </Card>
  );
}
