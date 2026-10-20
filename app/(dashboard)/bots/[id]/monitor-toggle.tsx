"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/api-client";
import type { BotDetail } from "./types";

/** The monitoring switch (header and Delivery). `onChange` reloads the bot so every consumer sees the new state. */
export function MonitorToggle({ bot, onChange }: { bot: BotDetail; onChange: () => void }) {
  const [toggling, setToggling] = useState(false);

  async function toggle(enabled: boolean) {
    setToggling(true);
    try {
      await apiFetch(`/api/bots/${bot.id}/monitor`, { method: "PUT", body: { enabled } });
      toast.success(enabled ? "Monitoring enabled." : "Monitoring disabled.");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle monitoring.");
    } finally {
      setToggling(false);
    }
  }

  return <Switch checked={bot.monitorEnabled} disabled={toggling} onCheckedChange={toggle} aria-label="Monitor incoming messages" />;
}
