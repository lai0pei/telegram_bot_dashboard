"use client";

import { Info, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-client";
import { draftCanSave, draftToBody, emptyRuleDraft, ruleToDraft, type RuleDraft } from "./rule-draft";
import { QUICK_STARTS, RuleDialog } from "./rule-dialog";
import { RuleList, ruleTitle } from "./rule-list";
import { previewOf } from "./rule-preview";
import { TemplatePicker } from "./template-picker";
import { TelegramPreview } from "./telegram-preview";
import type { AutoReplyRule, BotDetail } from "./types";

/**
 * Rules the background poller applies to incoming messages and button presses: the rule tree on the left, a phone
 * preview of the selected rule on the right (equal columns), and adding/editing in a dialog.
 */
export function AutomationTab({ bot, onPickTemplate }: { bot: BotDetail; onPickTemplate: (templateId: string | null) => void }) {
  const [rules, setRules] = useState<AutoReplyRule[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<RuleDraft>(emptyRuleDraft);
  const [saving, setSaving] = useState(false);
  // The draft as it was when the dialog opened, to tell whether closing would throw work away.
  const baseline = useRef("");

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

  function openDialog(rule: AutoReplyRule | null, preset?: RuleDraft) {
    const next = rule ? ruleToDraft(rule) : (preset ?? emptyRuleDraft());
    baseline.current = JSON.stringify(next);
    setEditingId(rule?.id ?? null);
    setDraft(next);
    setDialogOpen(true);
  }

  function requestClose() {
    if (JSON.stringify(draft) !== baseline.current && !window.confirm("Discard your changes to this rule?")) return;
    setDialogOpen(false);
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
      // The saved rule stays selected, so its preview shows and the tree scrolls to where it landed.
      setSelectedId(created?.id ?? editingId);
      setDialogOpen(false);
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
    if (!window.confirm(`Delete the rule "${ruleTitle(rule)}"?`)) return;
    try {
      await apiFetch(`/api/bots/${bot.id}/auto-replies/${rule.id}`, { method: "DELETE" });
      if (selectedId === rule.id) setSelectedId(null);
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete the rule.");
    }
  }

  const listening = bot.monitorEnabled && !bot.webhook?.url;
  const selected = rules?.find((r) => r.id === selectedId) ?? null;
  const preview = selected ? previewOf(ruleToDraft(selected), bot.id) : null;

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

      {/* No items-start / sticky: both cards stretch to the same height (the tree's own cap bounds it), so the two columns line up. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:max-h-[calc(100dvh-14rem)] lg:overflow-y-auto">
          <RuleList
            botId={bot.id}
            rules={rules}
            selectedId={selectedId}
            onSelect={(rule) => setSelectedId(rule.id)}
            onNew={() => openDialog(null)}
            onToggle={(rule, enabled) => void patch(rule, { enabled })}
            onMove={(rule, move) => void patch(rule, { move })}
          />
          {rules !== null && rules.length === 0 && (
            <div className="mt-4 space-y-3 border-t border-[var(--card-border)] pt-4">
              <p className="text-sm text-[var(--muted)]">Add your first rule — a welcome message is a good start — or begin with a ready-made bot:</p>
              <TemplatePicker compact selectedId={null} onSelect={(t) => onPickTemplate(t.id)} onMore={() => onPickTemplate(null)} className="grid gap-2 sm:grid-cols-2" />
            </div>
          )}
        </Card>

        <Card>
          <CardHeader className="flex-wrap gap-2">
            <CardTitle>{selected ? `How "${ruleTitle(selected)}" looks in Telegram` : "How it looks in Telegram"}</CardTitle>
          </CardHeader>
          {selected && preview ? (
            <div className="space-y-3">
              <TelegramPreview
                mode="chat"
                botName={bot.name ?? bot.firstName}
                username={bot.username}
                photoSrc={`/api/bots/${bot.id}/photo`}
                messages={preview.messages}
                keyboard={preview.keyboard}
                commands={bot.commands}
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => openDialog(selected)}>Edit rule</Button>
                <Button variant="ghost" className="ml-auto text-[var(--danger)]" onClick={() => void remove(selected)}>
                  <Trash2 className="h-4 w-4" aria-hidden /> Delete rule
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm text-[var(--muted)]">
              <p>Pick a rule on the left to see how its reply looks, or add a new one.</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => openDialog(null)}>New rule</Button>
                {QUICK_STARTS.map((q) => (
                  <Button key={q.label} variant="outline" onClick={() => openDialog(null, q.draft())}>
                    {q.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      <RuleDialog
        bot={bot}
        open={dialogOpen}
        editing={editingId !== null}
        draft={draft}
        onDraftChange={setDraft}
        canSave={canSave}
        saving={saving}
        onSave={save}
        onDelete={() => {
          const rule = rules?.find((r) => r.id === editingId);
          if (rule) void remove(rule);
        }}
        onClose={requestClose}
      />
    </div>
  );
}
