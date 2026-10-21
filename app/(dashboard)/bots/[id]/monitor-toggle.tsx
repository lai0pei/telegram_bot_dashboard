"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { ApiError, apiFetch } from "@/lib/api-client";
import type { BotDetail } from "./types";

/** Shown before monitoring is turned on for a bot this account owns (token bots get their own, stronger text below). */
export const MONITORING_WARNING =
  "If this bot already runs on your own server, or is monitored by another dashboard, only one of them can receive its messages. Turn it off there first.";

/** The monitoring switch (header and Delivery). `onChange` reloads the bot so every consumer sees the new state. */
export function MonitorToggle({ bot, onChange }: { bot: BotDetail; onChange: () => void }) {
  const [toggling, setToggling] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Set when another dashboard signed in with this account runs the bot: the name to show in the take-over dialog.
  const [heldBy, setHeldBy] = useState<string | null>(null);

  async function toggle(enabled: boolean, takeOver = false) {
    setConfirming(false);
    setHeldBy(null);
    setToggling(true);
    try {
      await apiFetch(`/api/bots/${bot.id}/monitor`, { method: "PUT", body: { enabled, takeOver } });
      toast.success(takeOver ? "This dashboard now runs the bot." : enabled ? "Monitoring enabled." : "Monitoring disabled.");
      onChange();
    } catch (err) {
      if (err instanceof ApiError && err.body.code === "BOT_RUN_ELSEWHERE" && typeof err.body.holder === "string") setHeldBy(err.body.holder);
      else toast.error(err instanceof Error ? err.message : "Failed to toggle monitoring.");
    } finally {
      setToggling(false);
    }
  }

  return (
    <>
      {bot.monitorEnabled && bot.runElsewhere && (
        <>
          <span className="text-[var(--muted-foreground)]" title="Another dashboard signed in with this Telegram account runs this bot, so this one is not reading its messages.">
            Standby · runs on {bot.runElsewhere}
          </span>
          <Button variant="outline" size="sm" className="h-6 px-2 text-xs" disabled={toggling} onClick={() => setHeldBy(bot.runElsewhere ?? "")}>
            Take over
          </Button>
        </>
      )}
      <Switch
        checked={bot.monitorEnabled}
        disabled={toggling}
        // Another server or dashboard may already be reading this bot's updates; two readers on one token fight over them.
        onCheckedChange={(enabled) => (enabled ? setConfirming(true) : void toggle(enabled))}
        aria-label="Monitor incoming messages"
      />
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogTitle>Start monitoring @{bot.username}?</DialogTitle>
          <DialogDescription>
            {bot.source === "token" ? (
              <>
                Monitoring makes the dashboard read this bot&apos;s messages (needed for Messages, auto-replies and stats). Telegram lets only one program read a
                bot&apos;s updates at a time, so if the owner&apos;s own server already does, their bot or this one will stop receiving messages. A bot with a
                webhook can&apos;t be monitored at all. Only turn it on if the owner agreed.
              </>
            ) : (
              <>
                Monitoring makes the dashboard read this bot&apos;s messages (needed for Messages, auto-replies and stats). {MONITORING_WARNING} A bot with a
                webhook can&apos;t be monitored at all.
              </>
            )}
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
      <Dialog open={heldBy !== null} onOpenChange={(open) => !open && setHeldBy(null)}>
        <DialogContent>
          <DialogTitle>Run @{bot.username} here instead?</DialogTitle>
          <DialogDescription>
            The dashboard &quot;{heldBy}&quot; is signed in with the same Telegram account and runs this bot. Taking it over makes that dashboard stop
            reading the bot&apos;s messages within a minute, so its auto-replies stop. Rules, templates and message history are not shared between
            dashboards: use &quot;Export setup&quot; there and &quot;Import setup&quot; here if you want the same rules.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setHeldBy(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void toggle(true, true)}>
              Take over
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
