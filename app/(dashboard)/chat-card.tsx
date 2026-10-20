import Link from "next/link";
import { memo } from "react";
import { Avatar } from "@/components/ui/avatar";
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
          <div className="mb-3 flex items-center gap-3">
            <Avatar src={`/api/chats/${chat.id}/photo`} name={chat.title} className="h-10 w-10" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{chat.title}</span>
                <Badge variant="primary" className="shrink-0">
                  {KIND_LABELS[chat.kind]}
                </Badge>
              </div>
              <p className="truncate text-sm text-[var(--muted)]">
                {chat.username ? `@${chat.username}` : "private"} · {chat.isCreator ? "owner" : "admin"}
              </p>
            </div>
          </div>
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
