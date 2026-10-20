"use client";

import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/api-client";
import { validateInlineResult } from "@/lib/validation";
import { ButtonsEditor, buttonsToDrafts, draftsToButtons, type ButtonDraft } from "./buttons-editor";
import type { BotDetail, InlineResultRule, ParseModeChoice } from "./types";

const select = "h-10 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 text-sm";

/** Results offered when someone types @bot in any chat, answered by the background poller. */
export function InlineResultsCard({ bot }: { bot: BotDetail }) {
  const [results, setResults] = useState<InlineResultRule[] | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [prefix, setPrefix] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [messageText, setMessageText] = useState("");
  const [parseMode, setParseMode] = useState<ParseModeChoice>("");
  const [drafts, setDrafts] = useState<ButtonDraft[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setResults((await apiFetch<{ results: InlineResultRule[] }>(`/api/bots/${bot.id}/inline-results`)).results);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load inline results.");
      setResults([]);
    }
  }, [bot.id]);

  useEffect(() => {
    // Intentional: fetch-on-mount into local state, not state synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setPrefix("");
    setTitle("");
    setDescription("");
    setMessageText("");
    setParseMode("");
    setDrafts([]);
  }

  function startEdit(r: InlineResultRule) {
    setEditingId(r.id);
    setPrefix(r.prefix);
    setTitle(r.title);
    setDescription(r.description ?? "");
    setMessageText(r.messageText);
    setParseMode(r.parseMode ?? "");
    setDrafts(buttonsToDrafts(r.buttons));
  }

  const buttons = draftsToButtons(drafts);
  const body = { prefix, title, description: description || null, messageText, parseMode: parseMode || null, buttons: buttons ?? null };
  const error = title || messageText ? validateInlineResult({ ...body, buttons }) : null;
  const canSave = Boolean(title.trim() && messageText.trim()) && !error && !saving;
  const inlineOff = bot.info?.supports_inline_queries === false;

  async function save() {
    setSaving(true);
    try {
      if (editingId) await apiFetch(`/api/bots/${bot.id}/inline-results/${editingId}`, { method: "PATCH", body });
      else await apiFetch(`/api/bots/${bot.id}/inline-results`, { body: { ...body, enabled: true } });
      toast.success(editingId ? "Result updated." : "Result added.");
      resetForm();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save the result.");
    } finally {
      setSaving(false);
    }
  }

  async function patch(r: InlineResultRule, patchBody: Record<string, unknown>) {
    try {
      await apiFetch(`/api/bots/${bot.id}/inline-results/${r.id}`, { method: "PATCH", body: patchBody });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update the result.");
    }
  }

  async function remove(r: InlineResultRule) {
    try {
      await apiFetch(`/api/bots/${bot.id}/inline-results/${r.id}`, { method: "DELETE" });
      if (editingId === r.id) resetForm();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete the result.");
    }
  }

  return (
    <div className="space-y-4">
      {(inlineOff || !bot.monitorEnabled) && (
        <Card className="space-y-1 text-sm">
          {inlineOff && (
            <p>
              Inline mode is <strong>off</strong> for this bot, so these results never show. Turn it on in BotFather with <code>/setinline</code>.
            </p>
          )}
          {!bot.monitorEnabled && (
            <p>
              Inline queries reach this dashboard only while <strong>monitoring is on</strong> and no webhook is set.
            </p>
          )}
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit inline result" : "Add an inline result"}</CardTitle>
        </CardHeader>
        <p className="mb-3 text-xs text-[var(--muted)]">
          Shown when someone types @{bot.username} in any chat. Picking one sends its message. Leave the trigger empty to offer it for every query, or set a word the query must start with.
        </p>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="inline-prefix">Trigger (optional)</Label>
              <Input id="inline-prefix" value={prefix} maxLength={64} onChange={(e) => setPrefix(e.target.value)} placeholder="pizza" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inline-title">Title</Label>
              <Input id="inline-title" value={title} maxLength={64} onChange={(e) => setTitle(e.target.value)} placeholder="Our menu" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inline-desc">Description (optional)</Label>
            <Input id="inline-desc" value={description} maxLength={128} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inline-text">Message that gets sent</Label>
            <textarea
              id="inline-text"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={3}
              maxLength={4096}
              className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="inline-format" className="shrink-0">
              Format
            </Label>
            <select id="inline-format" className={select} value={parseMode} onChange={(e) => setParseMode(e.target.value as ParseModeChoice)}>
              <option value="">Plain text</option>
              <option value="HTML">HTML</option>
              <option value="MarkdownV2">MarkdownV2</option>
            </select>
          </div>
          <ButtonsEditor drafts={drafts} onChange={setDrafts} botId={bot.id} chatId="-1" inlineMode={bot.info?.supports_inline_queries} />
          <FieldError error={error} />
          <div className="flex gap-2">
            <Button onClick={save} disabled={!canSave} loading={saving}>
              {editingId ? "Save changes" : "Add result"}
            </Button>
            {editingId && (
              <Button variant="ghost" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inline results</CardTitle>
          <span className="text-xs text-[var(--muted)]">Up to 50 matching results are offered, in this order.</span>
        </CardHeader>
        {results === null ? (
          <Skeleton className="h-24" />
        ) : results.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No inline results yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--card-border)]">
            {results.map((r, i) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5">
                <Switch checked={r.enabled} onCheckedChange={(enabled) => void patch(r, { enabled })} aria-label={`Enable ${r.title}`} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm">
                    <Badge variant="primary">{r.prefix ? `starts with “${r.prefix}”` : "every query"}</Badge>
                    <span className="truncate font-medium">{r.title}</span>
                  </p>
                  <p className="truncate text-xs text-[var(--muted)]">
                    {r.messageText}
                    {r.uses > 0 && ` · chosen ${r.uses}×`}
                  </p>
                </div>
                <Button variant="ghost" size="icon" disabled={i === 0} onClick={() => void patch(r, { move: "up" })} aria-label="Move up">
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" disabled={i === results.length - 1} onClick={() => void patch(r, { move: "down" })} aria-label="Move down">
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => startEdit(r)} aria-label="Edit result">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => void remove(r)} aria-label="Delete result">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-[var(--muted)]">
          &ldquo;Chosen&rdquo; counts only move when inline feedback is on: set it to 100% under Info &rarr; Capabilities &rarr; Advanced.
        </p>
      </Card>
    </div>
  );
}
