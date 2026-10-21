"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";

interface PartResult {
  part: string;
  applied: number;
  skipped: number;
  errors: string[];
}
interface ImportResult {
  telegramId: string;
  username: string;
  botId?: number;
  error?: string;
  parts: PartResult[];
}

const PART_LABELS: Record<string, string> = {
  rules: "Rules",
  deepLinks: "Deep links",
  inlineResults: "Inline results",
  buttonTemplates: "Button templates",
  games: "Games",
  miniApps: "Mini Apps",
};

/** "Import setup": adds the dashboard-only setup from a file exported on another dashboard (Bots → Select → Export setup). */
export function ImportSetupButton({ onDone }: { onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      let body: unknown;
      try {
        body = JSON.parse(await file.text());
      } catch {
        throw new Error("That file is not a bot setup file (it isn't valid JSON).");
      }
      const res = await apiFetch<{ results: ImportResult[] }>("/api/bots/import", { body });
      setResults(res.results);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The import failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <input ref={input} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
      <Button variant="outline" size="sm" loading={busy} onClick={() => input.current?.click()}>
        {!busy && <Upload className="h-3.5 w-3.5" />}
        Import setup
      </Button>
      <Dialog open={results !== null} onOpenChange={(open) => !open && setResults(null)}>
        <DialogContent>
          <DialogTitle>Import finished</DialogTitle>
          <DialogDescription>
            Only missing things were added; anything you already had was kept. Monitoring was not turned on: switch it off on the old dashboard first, then on here.
          </DialogDescription>
          <ul className="max-h-80 space-y-3 overflow-y-auto text-sm">
            {results?.map((r) => (
              <li key={r.telegramId}>
                <div className="font-medium">@{r.username || r.telegramId}</div>
                {r.error ? (
                  <p className="text-xs text-[var(--danger)]">{r.error}</p>
                ) : (
                  <ul className="space-y-0.5 text-xs">
                    {r.parts
                      .filter((p) => p.applied || p.skipped || p.errors.length)
                      .map((p) => (
                        <li key={p.part} className={p.errors.length ? "text-[var(--danger)]" : "text-[var(--muted)]"}>
                          {PART_LABELS[p.part] ?? p.part}: {p.applied} added, {p.skipped} already there{p.errors.length ? `. ${p.errors.join(" ")}` : ""}
                        </li>
                      ))}
                    {r.parts.every((p) => !p.applied && !p.skipped && !p.errors.length) && <li className="text-[var(--muted)]">Nothing to import for this bot.</li>}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setResults(null)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
