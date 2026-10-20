"use client";

import { Info, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-client";
import { draftCanSave, draftOutputs, draftToBody, emptyRuleDraft, isToastOnly, ruleToDraft, type RuleDraft } from "./rule-draft";
import { RuleFields } from "./rule-fields";
import { RuleList } from "./rule-list";
import { TemplatePicker } from "./template-picker";
import { TelegramPreview, type PreviewMessage } from "./telegram-preview";
import type { AutoReplyRule, BotDetail } from "./types";

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
    case "fallback":
      return "Something no rule knows";
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
export function AutomationTab({ bot, onPickTemplate }: { bot: BotDetail; onPickTemplate: (templateId: string | null) => void }) {
  const [rules, setRules] = useState<AutoReplyRule[] | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<RuleDraft>(emptyRuleDraft);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  // Declared here (not next to the toggle) because startNew needs setView.
  const [view, setView] = useState<"edit" | "preview">("edit");

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

  /** "+ New rule": the editor may be hidden behind the Preview toggle or below the list, so bring it into view. */
  function startNew() {
    resetForm();
    setView("edit");
    requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      editorRef.current?.querySelector<HTMLElement>("select, input, textarea")?.focus({ preventScroll: true });
    });
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
      let created: AutoReplyRule | null = null;
      if (editingId) await apiFetch(`/api/bots/${bot.id}/auto-replies/${editingId}`, { method: "PATCH", body });
      else created = (await apiFetch<{ rule: AutoReplyRule }>(`/api/bots/${bot.id}/auto-replies`, { body: { ...body, enabled: true } })).rule;
      toast.success(editingId ? "Rule updated." : "Rule added.");
      await load();
      // A new rule stays open and highlighted in the list, so it's visible where it landed.
      if (created) startEdit(created);
      else resetForm();
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
  // Below 1360px the editor and the phone share one column; this picks which one shows (both show side by side above).
  const only = (v: "edit" | "preview") => (view === v ? "" : "hidden wide:block");

  const toggle = (
    <div role="group" aria-label="Show" className="inline-flex rounded-lg border border-[var(--card-border)] p-0.5 text-xs wide:hidden">
      {(["edit", "preview"] as const).map((v) => (
        <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-md px-2.5 py-1 ${view === v ? "bg-[var(--primary)] text-white" : "text-[var(--muted)]"}`}>
          {v === "edit" ? "Edit" : "Preview"}
        </button>
      ))}
    </div>
  );

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

      <div className="grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)] wide:grid-cols-[300px_minmax(0,1fr)_320px]">
        <Card className="lg:col-start-1 lg:row-start-1 wide:sticky wide:top-6 wide:max-h-[calc(100dvh-3rem)] wide:overflow-y-auto">
          <RuleList
            rules={rules}
            selectedId={editingId}
            onSelect={startEdit}
            onNew={startNew}
            draft={editingId ? null : draft}
            onToggle={(rule, enabled) => void patch(rule, { enabled })}
            onMove={(rule, move) => void patch(rule, { move })}
          />
        </Card>

        <Card ref={editorRef} className={`lg:col-start-2 lg:row-start-1 ${only("edit")}`}>
          <CardHeader className="flex-wrap gap-2">
            <CardTitle>{editingId ? "Edit rule" : "Add a rule"}</CardTitle>
            {toggle}
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
          {rules !== null && rules.length === 0 && !editingId && (
            <div className="mb-4 space-y-3">
              <p className="text-sm text-[var(--muted)]">Add your first rule below — a welcome message is a good start — or begin with a ready-made bot:</p>
              <TemplatePicker compact selectedId={null} onSelect={(t) => onPickTemplate(t.id)} onMore={() => onPickTemplate(null)} className="grid gap-2 sm:grid-cols-2" />
            </div>
          )}
          <div className="space-y-3">
            <RuleFields bot={bot} draft={draft} onChange={setDraft} />
            <div className="flex flex-wrap gap-2">
              <Button onClick={save} disabled={!canSave} loading={saving}>
                {editingId ? "Save changes" : "Add rule"}
              </Button>
              {(editingId || draft.pattern || draft.replyText) && (
                <Button variant="ghost" onClick={resetForm}>
                  {editingId ? "Cancel" : "Clear"}
                </Button>
              )}
              {editingId && (
                <Button variant="ghost" className="ml-auto text-[var(--danger)]" onClick={() => void remove(rules?.find((r) => r.id === editingId) as AutoReplyRule)}>
                  <Trash2 className="h-4 w-4" aria-hidden /> Delete rule
                </Button>
              )}
            </div>
          </div>
        </Card>

        <Card className={`lg:col-start-2 lg:row-start-1 wide:col-start-3 wide:sticky wide:top-6 ${only("preview")}`}>
          <CardHeader className="flex-wrap gap-2">
            <CardTitle>How it looks in Telegram</CardTitle>
            {toggle}
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
    </div>
  );
}
