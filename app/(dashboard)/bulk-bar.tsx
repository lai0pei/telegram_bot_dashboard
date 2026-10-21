"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import type { BotSummary } from "./bot-card";
import { MONITORING_WARNING } from "./bots/[id]/monitor-toggle";

type CloneSection = "profile" | "commands" | "menuButton" | "adminRights" | "autoReplies";

const SECTION_LABELS: Record<CloneSection, string> = {
  profile: "Profile texts",
  commands: "Commands",
  menuButton: "Menu button",
  adminRights: "Admin rights",
  autoReplies: "Auto-replies",
};

interface BulkResult {
  botId: number;
  username: string;
  ok: boolean;
  message: string;
}

/** Actions over the bots picked on the /bots page: monitoring, health re-check and copying one bot's settings onto the rest. */
export function BulkBar({ selected, bots, onDone }: { selected: number[]; bots: BotSummary[]; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [confirmingMonitor, setConfirmingMonitor] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [sections, setSections] = useState<CloneSection[]>(["commands"]);

  /** Downloads the selected bots' dashboard-only setup as a JSON file (see lib/bot-setup-transfer.ts). */
  async function exportSetup() {
    setBusy("export");
    try {
      const res = await fetch(`/api/bots/export?ids=${selected.join(",")}`, { cache: "no-store" });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "The export failed.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `bot-setup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported the setup of ${selected.length} bot${selected.length === 1 ? "" : "s"}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The export failed.");
    } finally {
      setBusy(null);
    }
  }

  async function run(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setResults(null);
    try {
      const { results } = await apiFetch<{ results: BulkResult[] }>("/api/bots/bulk", { body: { action, botIds: selected, ...extra } });
      setResults(results);
      const failed = results.filter((r) => !r.ok).length;
      if (failed) toast.error(`${failed} of ${results.length} bots failed.`);
      else toast.success(`Done for ${results.length} bot${results.length === 1 ? "" : "s"}.`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The action failed.");
    } finally {
      setBusy(null);
    }
  }

  const disabled = selected.length === 0 || busy !== null;
  const sourceChoices = bots.filter((b) => b.hasToken);

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{selected.length} selected</span>
        <Button variant="outline" size="sm" disabled={disabled} loading={busy === "monitor_on"} onClick={() => setConfirmingMonitor(true)}>
          Monitoring on
        </Button>
        <Button variant="outline" size="sm" disabled={disabled} loading={busy === "monitor_off"} onClick={() => void run("monitor_off")}>
          Monitoring off
        </Button>
        <Button variant="outline" size="sm" disabled={disabled} loading={busy === "health"} onClick={() => void run("health")}>
          Re-check health
        </Button>
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => setCopyOpen((v) => !v)}>
          Copy settings from…
        </Button>
        <Button variant="outline" size="sm" disabled={disabled} loading={busy === "export"} onClick={() => void exportSetup()}>
          Export setup
        </Button>
      </div>
      <Dialog open={confirmingMonitor} onOpenChange={setConfirmingMonitor}>
        <DialogContent>
          <DialogTitle>Start monitoring {selected.length} bot{selected.length === 1 ? "" : "s"}?</DialogTitle>
          <DialogDescription>{MONITORING_WARNING} Bots with a webhook can&apos;t be monitored and will be reported as failed.</DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmingMonitor(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setConfirmingMonitor(false);
                void run("monitor_on");
              }}
            >
              Start monitoring
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {copyOpen && (
        <div className="space-y-2 text-sm">
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            aria-label="Bot to copy from"
            className="h-9 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-2 text-sm"
          >
            <option value="">Choose the source bot…</option>
            {sourceChoices.map((b) => (
              <option key={b.id} value={b.id}>
                @{b.username}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {(Object.keys(SECTION_LABELS) as CloneSection[]).map((s) => (
              <label key={s} className="flex items-center gap-1">
                <input type="checkbox" checked={sections.includes(s)} onChange={(e) => setSections(e.target.checked ? [...sections, s] : sections.filter((x) => x !== s))} />
                {SECTION_LABELS[s]}
              </label>
            ))}
          </div>
          <p className="text-xs text-[var(--muted)]">Overwrites the chosen settings on every selected bot (the source itself is skipped).</p>
          <Button
            size="sm"
            disabled={disabled || !sourceId || sections.length === 0}
            loading={busy === "copy"}
            onClick={() => void run("copy", { sourceBotId: Number(sourceId), include: sections })}
          >
            Copy to {selected.filter((id) => String(id) !== sourceId).length} bot(s)
          </Button>
        </div>
      )}
      {results && (
        <ul className="space-y-0.5 text-xs">
          {results.map((r) => (
            <li key={r.botId} className={r.ok ? "text-[var(--muted)]" : "text-[var(--danger)]"}>
              @{r.username}: {r.message}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
