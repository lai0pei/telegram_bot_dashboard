import Link from "next/link";
import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { InteractiveCard } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { StaggerItem } from "@/components/motion";
import { KIND_LABELS, type ChatSummary } from "./chats/[id]/types";

export const ChatCard = memo(function ChatCard({ chat }: { chat: ChatSummary }) {
  return (
    <StaggerItem>
      <Link href={`/chats/${chat.id}`}>
        <InteractiveCard className="h-full">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="truncate font-medium">{chat.title}</span>
            <Badge variant="primary" className="shrink-0">
              {KIND_LABELS[chat.kind]}
            </Badge>
          </div>
          <p className="mb-3 truncate text-sm text-[var(--muted)]">
            {chat.username ? `@${chat.username}` : "private"} · {chat.isCreator ? "owner" : "admin"}
          </p>
          <div className="flex items-center gap-1 text-xs text-[var(--muted)]">
            <span className="truncate">
              ID: <span className="font-mono">{chat.botApiId}</span>
            </span>
            <CopyButton value={chat.botApiId} />
          </div>
        </InteractiveCard>
      </Link>
    </StaggerItem>
  );
});
