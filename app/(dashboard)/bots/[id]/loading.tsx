import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function BotDetailLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-28" />
      </div>

      <div className="flex gap-2 border-b border-[var(--card-border)] pb-2">
        {["Info", "Settings", "Commands", "Webhook", "Messages", "Danger zone"].map((label) => (
          <Skeleton key={label} className="h-8 w-20" />
        ))}
      </div>

      <Card>
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </Card>
    </div>
  );
}
