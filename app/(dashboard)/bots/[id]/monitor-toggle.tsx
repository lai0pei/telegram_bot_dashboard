"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/api-client";
import type { BotDetail } from "./types";

/** The monitoring switch (header and Delivery). `onChange` reloads the bot so every consumer sees the new state. */
export function MonitorToggle({ bot, onChange }: { bot: BotDetail; onChange: () => void }) {
  const [toggling, setToggling] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function toggle(enabled: boolean) {
    setConfirming(false);
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

  return (
    <>
      <Switch
        checked={bot.monitorEnabled}
        disabled={toggling}
        // The owner's own server may already be reading this bot's updates; two readers on one token fight over them.
        onCheckedChange={(enabled) => (enabled && bot.source === "token" ? setConfirming(true) : void toggle(enabled))}
        aria-label="Monitor incoming messages"
      />
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogTitle>Start monitoring @{bot.username}?</DialogTitle>
          <DialogDescription>
            Monitoring makes the dashboard read this bot&apos;s messages (needed for Messages, auto-replies and stats). Telegram lets only one program read a bot&apos;s
            updates at a time, so if the owner&apos;s own server already does, their bot or this one will stop receiving messages. A bot with a webhook can&apos;t be
            monitored at all. Only turn it on if the owner agreed.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void toggle(true)}>
              Start monitoring
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
