"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";
import type { CloneResult, CloneSection } from "@/lib/bot-clone";
import type { BotDetail } from "./types";

const SECTIONS: { value: CloneSection; label: string }[] = [
  { value: "profile", label: "Name and descriptions (all languages)" },
  { value: "commands", label: "Commands (all scopes and languages)" },
  { value: "menuButton", label: "Menu button" },
  { value: "adminRights", label: "Default admin rights" },
  { value: "autoReplies", label: "Auto-replies (added after the target's own)" },
];

interface BotChoice {
  id: number;
  username: string;
  hasToken: boolean;
}

/** Copies this bot's settings onto another bot of the same account. */
export function CloneCard({ bot }: { bot: BotDetail }) {
  const [targets, setTargets] = useState<BotChoice[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [include, setInclude] = useState<CloneSection[]>(["profile", "commands", "menuButton"]);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Partial<Record<CloneSection, CloneResult>> | null>(null);

  async function loadTargets() {
    setLoading(true);
    try {
      // The bots list also syncs with Telegram, so it is only fetched when someone actually wants to copy.
      const { bots } = await apiFetch<{ bots: BotChoice[] }>("/api/bots");
      setTargets(bots.filter((b) => b.id !== bot.id && b.hasToken));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load your bots.");
    } finally {
      setLoading(false);
    }
  }

  async function run() {
    setRunning(true);
    setResults(null);
    try {
      const result = await apiFetch<{ results: Partial<Record<CloneSection, CloneResult>> }>(`/api/bots/${bot.id}/clone`, {
        body: { targetBotId: Number(targetId), include },
      });
      setResults(result.results);
      setConfirming(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to copy the settings.");
    } finally {
      setRunning(false);
    }
  }

  const target = targets?.find((t) => String(t.id) === targetId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Copy settings to another bot</CardTitle>
      </CardHeader>
      {targets === null ? (
        <Button variant="outline" size="sm" onClick={loadTargets} loading={loading}>
          Choose a bot…
        </Button>
      ) : targets.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">You have no other bot with a stored token.</p>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="clone-target">Copy to</Label>
            <select
              id="clone-target"
              value={targetId}
              onChange={(e) => { setTargetId(e.target.value); setConfirming(false); setResults(null); }}
              className="h-10 w-full rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 text-sm sm:w-72"
            >
              <option value="">Select a bot</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  @{t.username}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-sm font-medium">What to copy</legend>
            {SECTIONS.map((s) => (
              <label key={s.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={include.includes(s.value)}
                  onChange={(e) => {
                    setInclude((prev) => (e.target.checked ? [...prev, s.value] : prev.filter((v) => v !== s.value)));
                    setConfirming(false);
                  }}
                />
                {s.label}
              </label>
            ))}
          </fieldset>
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--card-border)] p-3 text-sm">
              <span className="flex-1">This overwrites those settings on @{target?.username}.</span>
              <Button variant="danger" onClick={run} loading={running}>
                Copy now
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="outline" disabled={!targetId || include.length === 0} onClick={() => setConfirming(true)}>
              Copy…
            </Button>
          )}
          {results && (
            <ul className="space-y-1.5 text-sm" aria-live="polite">
              {SECTIONS.filter((s) => results[s.value]).map((s) => {
                const r = results[s.value]!;
                return (
                  <li key={s.value}>
                    <span className="font-medium">{s.label.split(" (")[0]}:</span> {r.copied} copied
                    {r.skipped ? `, ${r.skipped} had nothing to copy` : ""}
                    {r.errors.length > 0 && (
                      <ul className="ml-4 list-disc text-xs text-[var(--danger)]">
                        {r.errors.slice(0, 5).map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                        {r.errors.length > 5 && <li>…and {r.errors.length - 5} more</li>}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
