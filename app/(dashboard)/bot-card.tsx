import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { memo } from "react";
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
  error: string | null;
}

export const BotCard = memo(function BotCard({ bot }: { bot: BotSummary }) {
  return (
    <StaggerItem>
      <Link href={`/bots/${bot.id}`}>
        <InteractiveCard className="h-full">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="truncate font-medium">@{bot.username}</span>
            {bot.monitorEnabled && (
              <Badge variant="success" className="shrink-0">
                Monitoring
              </Badge>
            )}
          </div>
          <p className="mb-3 truncate text-sm text-[var(--muted)]">{bot.firstName}</p>
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
