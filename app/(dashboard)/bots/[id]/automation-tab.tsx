"use client";

import { ArrowDown, ArrowUp, Info, Pencil, Trash2 } from "lucide-react";
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
import { MEDIA_KINDS, validateAutoReply } from "@/lib/validation";
import { TEMPLATE_PLACEHOLDERS } from "@/lib/templates";
import { ButtonsEditor, buttonsToDrafts, draftsToButtons, type ButtonDraft } from "./buttons-editor";
import { KeyboardEditor, draftToReplyKeyboard, keyboardDraftError, emptyKeyboardDraft, replyKeyboardToDraft, type KeyboardDraft } from "./keyboard-editor";
import { DeepLinksCard } from "./deep-links-card";
import { InlineResultsCard } from "./inline-results-card";
import type { AutoReplyMatchType, AutoReplyRule, BotDetail, CallbackAction, ParseModeChoice } from "./types";

const MATCH_TYPES: { value: AutoReplyMatchType; label: string; patternHint: string }[] = [
  { value: "command", label: "Command", patternHint: "start (without the slash)" },
  { value: "exact", label: "Exact text", patternHint: "hello" },
  { value: "contains", label: "Contains text", patternHint: "price" },
  { value: "callback", label: "Button press", patternHint: "the button's callback data, e.g. ok" },
  { value: "callback_prefix", label: "Button press (starts with)", patternHint: "callback data prefix, e.g. page:" },
  { value: "deeplink", label: "Deep link (/start payload)", patternHint: "the payload after ?start=, e.g. promo_2026" },
  { value: "media", label: "Receives a…", patternHint: "" },
  { value: "shared", label: "User/chat picked (request ID)", patternHint: "the request ID of the keyboard button, e.g. 1" },
];

const isCallbackType = (t: AutoReplyMatchType) => t === "callback" || t === "callback_prefix";

const CALLBACK_ACTION_LABELS: Record<CallbackAction, string> = {
  toast: "Show a toast / pop-up",
  edit: "Edit the message with the button",
  reply: "Send a new message",
};

const select = "h-10 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 text-sm";

/** Rules the background poller applies to incoming messages and button presses. */
export function AutomationTab({ bot }: { bot: BotDetail }) {
  const [rules, setRules] = useState<AutoReplyRule[] | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [matchType, setMatchType] = useState<AutoReplyMatchType>("command");
  const [pattern, setPattern] = useState("");
  const [replyText, setReplyText] = useState("");
  const [parseMode, setParseMode] = useState<ParseModeChoice>("");
  const [showAlert, setShowAlert] = useState(false);
  const [callbackAction, setCallbackAction] = useState<CallbackAction>("toast");
  const [drafts, setDrafts] = useState<ButtonDraft[]>([]);
  const [keyboard, setKeyboard] = useState<KeyboardDraft>(emptyKeyboardDraft);
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
    setMatchType("command");
    setPattern("");
    setReplyText("");
    setParseMode("");
    setShowAlert(false);
    setCallbackAction("toast");
    setDrafts([]);
    setKeyboard(emptyKeyboardDraft());
  }

  function startEdit(rule: AutoReplyRule) {
    setEditingId(rule.id);
    setMatchType(rule.matchType);
    setPattern(rule.pattern);
    setReplyText(rule.replyText);
    setParseMode(rule.parseMode ?? "");
    setShowAlert(rule.showAlert);
    setCallbackAction(rule.callbackAction ?? "toast");
    setDrafts(buttonsToDrafts(rule.buttons));
    setKeyboard(replyKeyboardToDraft(rule.replyKeyboard));
  }

  const toastOnly = isCallbackType(matchType) && callbackAction === "toast";
  const buttons = toastOnly ? undefined : draftsToButtons(drafts);
  const replyKeyboard = toastOnly || (isCallbackType(matchType) && callbackAction === "edit") ? undefined : draftToReplyKeyboard(keyboard);
  const error =
    pattern || replyText
      ? validateAutoReply({ matchType, pattern, replyText, parseMode, buttons, replyKeyboard, callbackAction }) ?? keyboardDraftError(keyboard)
      : null;
  const canSave = Boolean(pattern.trim() && replyText.trim()) && !error && !saving;

  async function save() {
    setSaving(true);
    try {
      const body = { matchType, pattern, replyText, parseMode: parseMode || null, buttons: buttons ?? null, replyKeyboard: replyKeyboard ?? null, showAlert, callbackAction };
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
        <Card>
          <CardHeader>
            <CardTitle>Rules</CardTitle>
            <span className="text-xs text-[var(--muted)]">Checked top to bottom; the first match replies.</span>
          </CardHeader>
          {rules === null ? (
            <Skeleton className="h-24" />
          ) : rules.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No rules yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--card-border)]">
              {rules.map((rule, i) => (
                <li key={rule.id} className="flex items-center gap-3 py-2.5">
                  <Switch checked={rule.enabled} onCheckedChange={(enabled) => void patch(rule, { enabled })} aria-label={`Enable ${rule.pattern}`} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm">
                      <Badge variant="primary">{MATCH_TYPES.find((t) => t.value === rule.matchType)?.label}</Badge>
                      <span className="truncate font-medium">{rule.matchType === "command" ? `/${rule.pattern}` : rule.pattern}</span>
                    </p>
                    <p className="truncate text-xs text-[var(--muted)]">
                      {isCallbackType(rule.matchType) && rule.callbackAction !== "toast" ? `${CALLBACK_ACTION_LABELS[rule.callbackAction]}: ` : ""}
                      {rule.replyText}
                    </p>
                    {rule.hits > 0 && (
                      <p className="text-xs text-[var(--muted)]">
                        Fired {rule.hits} time{rule.hits === 1 ? "" : "s"}
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

        <Card className="xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto">
          <CardHeader>
            <CardTitle>{editingId ? "Edit rule" : "Add a rule"}</CardTitle>
            {!editingId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setMatchType("command");
                  setPattern("start");
                  setReplyText("Welcome! Send me a message and I'll get back to you.");
                }}
              >
                Welcome message (/start)
              </Button>
            )}
            {!editingId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setMatchType("command");
                  setPattern("help");
                  setReplyText("Hi {first_name}! Here is what I can do:\n{commands}");
                }}
              >
                Help (/help)
              </Button>
            )}
          </CardHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="rule-type">When</Label>
                <select
                  id="rule-type"
                  className={`${select} w-full`}
                  value={matchType}
                  onChange={(e) => {
                    const next = e.target.value as AutoReplyMatchType;
                    setMatchType(next);
                    // The pattern's meaning changes with the type (a media kind is picked from a list), so start afresh.
                    setPattern(next === "media" ? MEDIA_KINDS[0] : "");
                  }}
                >
                  {MATCH_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-pattern">Pattern</Label>
                {matchType === "media" ? (
                  <select id="rule-pattern" className={`${select} w-full`} value={pattern} onChange={(e) => setPattern(e.target.value)}>
                    {MEDIA_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id="rule-pattern"
                    value={pattern}
                    onChange={(e) => setPattern(e.target.value)}
                    placeholder={MATCH_TYPES.find((t) => t.value === matchType)?.patternHint}
                  />
                )}
              </div>
            </div>
            {isCallbackType(matchType) && (
              <div className="flex items-center gap-2">
                <Label htmlFor="rule-action" className="shrink-0">
                  Then
                </Label>
                <select id="rule-action" className={select} value={callbackAction} onChange={(e) => setCallbackAction(e.target.value as CallbackAction)}>
                  {(Object.keys(CALLBACK_ACTION_LABELS) as CallbackAction[]).map((a) => (
                    <option key={a} value={a}>
                      {CALLBACK_ACTION_LABELS[a]}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="rule-reply">{toastOnly ? "Answer shown to the user" : callbackAction === "edit" && isCallbackType(matchType) ? "New text of the message" : "Reply"}</Label>
              <textarea
                id="rule-reply"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={3}
                maxLength={toastOnly ? 200 : 4096}
                className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              />
            </div>
            {!toastOnly && (
              <p className="text-xs text-[var(--muted)]">
                Placeholders: {TEMPLATE_PLACEHOLDERS.map((p) => `{${p}}`).join(" ")}. They are filled in (and escaped for the chosen format) when the reply is sent.
              </p>
            )}
            {toastOnly ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={showAlert} onChange={(e) => setShowAlert(e.target.checked)} />
                Show as a pop-up alert instead of a short toast
              </label>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Label htmlFor="rule-format" className="shrink-0">
                    Format
                  </Label>
                  <select id="rule-format" className={select} value={parseMode} onChange={(e) => setParseMode(e.target.value as ParseModeChoice)}>
                    <option value="">Plain text</option>
                    <option value="HTML">HTML</option>
                    <option value="MarkdownV2">MarkdownV2</option>
                  </select>
                </div>
                <ButtonsEditor drafts={drafts} onChange={setDrafts} botId={bot.id} inlineMode={bot.info?.supports_inline_queries} />
                {!(isCallbackType(matchType) && callbackAction === "edit") && (
                  <KeyboardEditor
                    draft={keyboard}
                    onChange={setKeyboard}
                    disabledReason={buttons ? "Remove the inline buttons to use a reply keyboard (a message can have only one)." : null}
                  />
                )}
              </>
            )}
            {(matchType === "exact" || matchType === "contains") && (
              <p className="text-xs text-[var(--muted)]">Text rules only answer private chats. Matching ignores upper/lower case, and the first matching rule wins.</p>
            )}
            {matchType === "deeplink" && (
              <p className="text-xs text-[var(--muted)]">
                Answers <code>/start &lt;payload&gt;</code> (links like t.me/{bot.username}?start=payload). The payload is case-sensitive and a deep-link rule beats a
                plain /start rule.
              </p>
            )}
            {(matchType === "media" || matchType === "shared") && (
              <p className="text-xs text-[var(--muted)]">Answers private chats only. Pickers (&ldquo;shared&rdquo;) come from a reply-keyboard button that asks for a user or chat.</p>
            )}
            <FieldError error={error} />
            <div className="flex gap-2">
              <Button onClick={save} disabled={!canSave} loading={saving}>
                {editingId ? "Save changes" : "Add rule"}
              </Button>
              {editingId && (
                <Button variant="ghost" onClick={resetForm}>
                  Cancel
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
