"use client";

import { ArrowDown, ArrowUp, Info, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/api-client";
import { DeepLinksCard } from "./deep-links-card";
import { InlineResultsCard } from "./inline-results-card";
import { draftCanSave, draftOutputs, draftToBody, emptyRuleDraft, isCallbackType, isToastOnly, ruleToDraft, type RuleDraft } from "./rule-draft";
import { CALLBACK_ACTION_LABELS, RuleFields } from "./rule-fields";
import { TelegramPreview, type PreviewMessage } from "./telegram-preview";
import type { AutoReplyMatchType, AutoReplyRule, BotDetail } from "./types";

const MATCH_SHORT: Record<AutoReplyMatchType, string> = {
  command: "Command",
  exact: "Exact text",
  contains: "Contains",
  callback: "Button",
  callback_prefix: "Button (starts with)",
  deeplink: "Special link",
  media: "Media",
  shared: "Shared",
};

/** What the person would have done to trigger the rule, as the preview's first bubble (none for a button press). */
function triggerText(d: RuleDraft): string | null {
  const p = d.pattern.trim();
  switch (d.matchType) {
    case "command":
      return `/${p.replace(/^\//, "") || "command"}`;
    case "exact":
    case "contains":
      return p || "…";
    case "deeplink":
      return `/start ${p || "code"}`;
    case "media":
      return `[${p.replace("_", " ") || "file"}]`;
    case "shared":
      return "[shared a contact or chat]";
    default:
      return null;
  }
}

/** How a rule's reply will look in Telegram, from the form's current state. */
export function previewOf(d: RuleDraft): { messages: PreviewMessage[]; keyboard: ReturnType<typeof draftOutputs>["replyKeyboard"] } {
  const { buttons, replyKeyboard } = draftOutputs(d);
  const trigger = triggerText(d);
  const messages: PreviewMessage[] = [];
  if (trigger) messages.push({ from: "user", text: trigger });
  const text = d.replyText || "Your reply appears here.";
  if (isToastOnly(d)) messages.push({ from: "bot", text, toast: true });
  else messages.push({ from: "bot", text, parseMode: d.parseMode, buttons });
  return { messages, keyboard: replyKeyboard };
}

/** Rules the background poller applies to incoming messages and button presses. */
export function AutomationTab({ bot }: { bot: BotDetail }) {
  const [rules, setRules] = useState<AutoReplyRule[] | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<RuleDraft>(emptyRuleDraft);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<{ rules: AutoReplyRule[] }>(`/api/bots/${bot.id}/auto-replies`);
      setRules(result.rules);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load rules.");
      setRules([]);
    }
  }, [bot.id]);

  useEffect(() => {
    // Intentional: fetch-on-mount into local state, not state synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setDraft(emptyRuleDraft());
  }

  function startEdit(rule: AutoReplyRule) {
    setEditingId(rule.id);
    setDraft(ruleToDraft(rule));
  }

  const canSave = draftCanSave(draft) && !saving;

  async function save() {
    setSaving(true);
    try {
      const body = draftToBody(draft);
      if (editingId) await apiFetch(`/api/bots/${bot.id}/auto-replies/${editingId}`, { method: "PATCH", body });
      else await apiFetch(`/api/bots/${bot.id}/auto-replies`, { body: { ...body, enabled: true } });
      toast.success(editingId ? "Rule updated." : "Rule added.");
      resetForm();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save the rule.");
    } finally {
      setSaving(false);
    }
  }

  async function patch(rule: AutoReplyRule, body: Record<string, unknown>) {
    try {
      await apiFetch(`/api/bots/${bot.id}/auto-replies/${rule.id}`, { method: "PATCH", body });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update the rule.");
    }
  }

  async function remove(rule: AutoReplyRule) {
    try {
      await apiFetch(`/api/bots/${bot.id}/auto-replies/${rule.id}`, { method: "DELETE" });
      if (editingId === rule.id) resetForm();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete the rule.");
    }
  }

  const listening = bot.monitorEnabled && !bot.webhook?.url;
  const preview = previewOf(draft);

  return (
    <div className="space-y-4">
      {!listening && (
        <Card className="flex items-start gap-2 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden />
          <p>
            Rules run on incoming messages, which this dashboard only sees while <strong>monitoring is on</strong> and no webhook is set.
            {bot.webhook?.url ? " This bot has a webhook, so the rules won't fire." : " Turn monitoring on with the switch in the header."}
          </p>
        </Card>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Automatic replies</CardTitle>
              <span className="text-xs text-[var(--muted)]">Checked top to bottom; the first match replies.</span>
            </CardHeader>
            {rules === null ? (
              <Skeleton className="h-24" />
            ) : rules.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No rules yet. Add your first one on the right — a welcome message is a good start.</p>
            ) : (
              <ul className="divide-y divide-[var(--card-border)]">
                {rules.map((rule, i) => (
                  <li key={rule.id} className="flex items-center gap-3 py-2.5">
                    <Switch checked={rule.enabled} onCheckedChange={(enabled) => void patch(rule, { enabled })} aria-label={`Enable ${rule.pattern}`} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm">
                        <Badge variant="primary">{MATCH_SHORT[rule.matchType]}</Badge>
                        <span className="truncate font-medium">{rule.matchType === "command" ? `/${rule.pattern}` : rule.pattern}</span>
                      </p>
                      <p className="truncate text-xs text-[var(--muted)]">
                        {isCallbackType(rule.matchType) && rule.callbackAction !== "toast" ? `${CALLBACK_ACTION_LABELS[rule.callbackAction]}: ` : ""}
                        {rule.replyText}
                      </p>
                      {rule.hits > 0 && (
                        <p className="text-xs text-[var(--muted)]">
                          Used {rule.hits} time{rule.hits === 1 ? "" : "s"}
                          {rule.lastHitAt ? `, last ${new Date(rule.lastHitAt).toLocaleString()}` : ""}
                        </p>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" disabled={i === 0} onClick={() => void patch(rule, { move: "up" })} aria-label="Move up">
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" disabled={i === rules.length - 1} onClick={() => void patch(rule, { move: "down" })} aria-label="Move down">
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => startEdit(rule)} aria-label="Edit rule">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => void remove(rule)} aria-label="Delete rule">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>How it looks in Telegram</CardTitle>
            </CardHeader>
            <TelegramPreview
              mode="chat"
              botName={bot.name ?? bot.firstName}
              username={bot.username}
              photoSrc={`/api/bots/${bot.id}/photo`}
              messages={preview.messages}
              keyboard={preview.keyboard}
              commands={bot.commands}
            />
          </Card>
        </div>

        <Card className="xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto">
          <CardHeader className="flex-wrap gap-2">
            <CardTitle>{editingId ? "Edit rule" : "Add a rule"}</CardTitle>
            {!editingId && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDraft({ ...emptyRuleDraft(), matchType: "command", pattern: "start", replyText: "Welcome, {first_name}! Send me a message and I'll get back to you." })}
                >
                  Welcome message (/start)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDraft({ ...emptyRuleDraft(), matchType: "command", pattern: "help", replyText: "Hi {first_name}! Here is what I can do:\n{commands}" })}
                >
                  Help (/help)
                </Button>
              </div>
            )}
          </CardHeader>
          <div className="space-y-3">
            <RuleFields bot={bot} draft={draft} onChange={setDraft} />
            <div className="flex gap-2">
              <Button onClick={save} disabled={!canSave} loading={saving}>
                {editingId ? "Save changes" : "Add rule"}
              </Button>
              {(editingId || draft.pattern || draft.replyText) && (
                <Button variant="ghost" onClick={resetForm}>
                  {editingId ? "Cancel" : "Clear"}
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <DeepLinksCard bot={bot} />
        <InlineResultsCard bot={bot} />
      </div>
    </div>
  );
}
