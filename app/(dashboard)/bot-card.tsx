import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { memo } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { InteractiveCard } from "@/components/ui/card";
import { StaggerItem } from "@/components/motion";

export interface BotSummary {
  id: number;
  username: string;
  firstName: string;
  hasToken: boolean;
  maskedToken: string | null;
  monitorEnabled: boolean;
  details: { id: number; first_name: string } | null;
  webhook: { url: string } | null;
  health?: { status: "ok" | "warning" | "error"; message: string | null } | null;
  error: string | null;
}

const HEALTH_DOT = { ok: "bg-[var(--success)]", warning: "bg-amber-500", error: "bg-[var(--danger)]" } as const;

export const BotCard = memo(function BotCard({
  bot,
  selecting = false,
  selected = false,
  onToggle,
}: {
  bot: BotSummary;
  /** Select mode: the card toggles a checkbox instead of opening the bot. */
  selecting?: boolean;
  selected?: boolean;
  onToggle?: (id: number) => void;
}) {
  return (
    <StaggerItem>
      <Link
        href={`/bots/${bot.id}`}
        onClick={(e) => {
          if (!selecting) return;
          e.preventDefault();
          onToggle?.(bot.id);
        }}
        aria-pressed={selecting ? selected : undefined}
        className={selecting && selected ? "block rounded-xl ring-2 ring-[var(--primary)]" : undefined}
      >
        <InteractiveCard className="h-full">
          <div className="mb-3 flex items-center gap-3">
            <Avatar src={`/api/bots/${bot.id}/photo`} name={bot.username} className="h-10 w-10" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  {bot.health && (
                    <span
                      role="img"
                      aria-label={`Health: ${bot.health.status}`}
                      title={bot.health.message ?? "Healthy"}
                      className={`h-2 w-2 shrink-0 rounded-full ${HEALTH_DOT[bot.health.status]}`}
                    />
                  )}
                  <span className="truncate font-medium">@{bot.username}</span>
                </span>
                {bot.monitorEnabled && (
                  <Badge variant="success" className="shrink-0">
                    Monitoring
                  </Badge>
                )}
              </div>
              <p className="truncate text-sm text-[var(--muted)]">{bot.firstName}</p>
            </div>
          </div>
          <div className="space-y-1 text-xs text-[var(--muted)]">
            <div>Token: {bot.maskedToken ?? "not fetched"}</div>
            <div>Webhook: {bot.webhook?.url ? "set" : "none"}</div>
            {bot.error && (
              <div className="flex items-center gap-1 text-[var(--danger)]">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {bot.error}
              </div>
            )}
          </div>
        </InteractiveCard>
      </Link>
    </StaggerItem>
  );
});
