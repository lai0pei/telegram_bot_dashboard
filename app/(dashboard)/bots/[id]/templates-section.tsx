"use client";

import { AlertTriangle, ArrowLeft, Check, RotateCcw, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import { planRemoval, templateRuleKey, type BotTemplate, type TemplatePart } from "@/lib/bot-templates";
import { emptySim, simulatePress, simulateSend, simulateShare, type SimRule } from "@/lib/simulate";
import { MONITORING_WARNING } from "./monitor-toggle";
import type { SectionId } from "./sections";
import { PART_LABELS, TemplatePicker, availableParts, useApplyTemplate, useTemplates } from "./template-picker";
import { TelegramPreview } from "./telegram-preview";
import type { AutoReplyRule, BotDetail } from "./types";

interface RemoveResult {
  part: "rules" | "commands";
  removed: number;
  kept: string[];
  errors: string[];
}

/**
 * Starter recipes in two screens: a gallery of cards, then the chosen template with a big preview / try-it, what it adds,
 * and (for ones already added) a way to take it out again. Nothing existing is replaced.
 */
export function TemplatesSection({ bot, photoSrc, initialTemplateId, onChange, onOpen }: { bot: BotDetail; photoSrc: string; /** Opens this template's screen straight away (the empty "All rules" list links here with one). */ initialTemplateId?: string | null; onChange: () => void; onOpen: (section: SectionId) => void }) {
  const { templates, loaded, reload } = useTemplates();
  const [selectedId, setSelectedId] = useState<string | null>(initialTemplateId ?? null);
  const [rules, setRules] = useState<AutoReplyRule[] | null>(null);
  const [parts, setParts] = useState<Record<TemplatePart, boolean>>({ profile: true, commands: true, rules: true, monitoring: true });
  const [overwriteProfile, setOverwriteProfile] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | null>(null);
  // The template whose "remove" confirm is open; the gallery cards and the detail screen share this one dialog.
  const [removeTarget, setRemoveTarget] = useState<BotTemplate | null>(null);
  // The card whose quick Apply is running, so only its button shows a spinner.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState<{ templateId: string; items: RemoveResult[] } | null>(null);
  // Bumped after applying or removing, so the "already there" counts below refresh.
  const [version, setVersion] = useState(0);
  const { apply: applyTemplate, applying, results, clearResults } = useApplyTemplate(bot.id, () => {
    setVersion((v) => v + 1);
    onChange();
  });

  useEffect(() => {
    let live = true;
    apiFetch<{ rules: AutoReplyRule[] }>(`/api/bots/${bot.id}/auto-replies`)
      .then((r) => live && setRules(r.rules))
      .catch(() => live && setRules([]));
    return () => {
      live = false;
    };
  }, [bot.id, version]);

  function open(id: string | null) {
    setSelectedId(id);
    clearResults();
    setRemoved(null);
    window.scrollTo({ top: 0 });
  }

  const template = selectedId ? templates.find((t) => t.id === selectedId) : undefined;

  // What "remove" would delete: only rules and commands that are still exactly as the template made them.
  // null while the rules load, so nothing is decided on stale data.
  const planFor = (t: BotTemplate) => (rules === null ? null : planRemoval(t, rules, bot.commands ?? []));
  const removePlan = removeTarget ? planFor(removeTarget) : null;

  async function remove(t: BotTemplate) {
    setBusy(true);
    try {
      const r = await apiFetch<{ results: RemoveResult[] }>(`/api/bots/${bot.id}/templates`, { method: "DELETE", body: { templateId: t.id } });
      setRemoved({ templateId: t.id, items: r.results });
      clearResults();
      setVersion((v) => v + 1);
      onChange();
      toast.success(`${t.title} removed.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove the template.");
    } finally {
      setBusy(false);
      setRemoveTarget(null);
    }
  }

  async function quickApply(t: BotTemplate) {
    setPendingId(t.id);
    try {
      // Never overwrites profile texts; the detail screen is where that is chosen.
      await applyTemplate(t, availableParts(bot), false, "open Details to see which");
    } finally {
      setPendingId(null);
    }
  }

  const removeDialog = <RemoveDialog template={removeTarget} plan={removePlan} busy={busy} onCancel={() => setRemoveTarget(null)} onConfirm={() => removeTarget && void remove(removeTarget)} />;

  if (!template) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Start from a template</h2>
            <p className="text-sm text-[var(--muted)]">Pick a ready-made bot to see it in action, then add it to @{bot.username}. Nothing you already have is replaced.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setSaveOpen(true)}>
            <Save className="h-3.5 w-3.5" />
            Save this bot as a template
          </Button>
        </div>
        {selectedId && !loaded && <p className="text-sm text-[var(--muted)]">Loading your templates…</p>}
        <TemplatePicker
          selectedId={null}
          templates={templates}
          onSelect={(t) => open(t.id)}
          renderCard={(t) => {
            const plan = planFor(t);
            const added = plan ? plan.rules.length + plan.commands.length > 0 : false;
            const locked = plan === null || busy || pendingId !== null;
            return {
              status: added ? "added" : null,
              actions: (
                <>
                  {added ? (
                    <Button variant="outline" size="sm" className="text-[var(--danger)]" onClick={() => setRemoveTarget(t)} disabled={locked}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => void quickApply(t)} loading={pendingId === t.id} disabled={locked}>
                      Apply
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => open(t.id)}>
                    Details
                  </Button>
                </>
              ),
            };
          }}
        />
        {removeDialog}
        <SaveDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          bot={bot}
          onSaved={async (t) => {
            await reload();
            open(t.id);
          }}
        />
      </div>
    );
  }

  const listening = bot.monitorEnabled && !bot.webhook?.url;
  const have = new Set((rules ?? []).map((r) => templateRuleKey(r)));
  const newRules = template.rules.filter((r) => !have.has(templateRuleKey(r)));
  const haveCommands = new Set((bot.commands ?? []).map((c) => c.command.toLowerCase()));
  const newCommands = template.commands.filter((c) => !haveCommands.has(c.command));
  const profileFields = [
    { label: "short description", value: template.profile?.shortDescription, current: bot.shortDescription },
    { label: "description", value: template.profile?.description, current: bot.description },
  ].filter((f) => f.value);
  const profileKept = profileFields.filter((f) => f.current?.trim()).length;
  const plan = planFor(template);
  const removable = plan ? plan.rules.length + plan.commands.length : 0;

  // Monitoring is only offered (and sent) when it is off and no webhook blocks it.
  const chosen = availableParts(bot).filter((p) => parts[p]);
  const toggle = (p: TemplatePart) => setParts((prev) => ({ ...prev, [p]: !prev[p] }));
  const apply = () => applyTemplate(template, chosen, overwriteProfile);

  async function deleteSaved() {
    setBusy(true);
    try {
      await apiFetch(`/api/custom-templates/${template!.id.replace("custom-", "")}`, { method: "DELETE" });
      toast.success("Template deleted.");
      await reload();
      open(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete the template.");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button type="button" onClick={() => open(null)} className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
            <ArrowLeft className="h-4 w-4" aria-hidden /> All templates
          </button>
          <h2 className="text-base font-semibold">
            {template.emoji} {template.title}
          </h2>
          <p className="max-w-2xl text-sm text-[var(--muted)]">{template.blurb}</p>
          <p className="mt-2 flex flex-wrap gap-1">
            {template.shows.map((tag) => (
              <span key={tag} className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-[var(--muted)] dark:bg-white/5">
                {tag}
              </span>
            ))}
          </p>
        </div>
        {template.custom && (
          <Button variant="ghost" size="sm" className="text-[var(--danger)]" onClick={() => setConfirm("delete")}>
            <Trash2 className="h-3.5 w-3.5" /> Delete this template
          </Button>
        )}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>What it adds to @{bot.username}</CardTitle>
            </CardHeader>
            <ul className="space-y-3 text-sm">
              {template.profile && (
                <PartRow
                  checked={parts.profile}
                  onToggle={() => toggle("profile")}
                  title={PART_LABELS.profile}
                  detail={
                    profileKept === profileFields.length && !overwriteProfile
                      ? "Both are already filled in, so they are kept."
                      : `Fills ${profileFields.length - (overwriteProfile ? 0 : profileKept)} empty text${profileFields.length - (overwriteProfile ? 0 : profileKept) === 1 ? "" : "s"}.`
                  }
                >
                  {profileKept > 0 && (
                    <label className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">
                      <input type="checkbox" checked={overwriteProfile} onChange={(e) => setOverwriteProfile(e.target.checked)} />
                      Replace the texts I already wrote
                    </label>
                  )}
                </PartRow>
              )}
              {template.commands.length > 0 && (
                <PartRow
                  checked={parts.commands}
                  onToggle={() => toggle("commands")}
                  title={PART_LABELS.commands}
                  detail={newCommands.length ? `Adds ${newCommands.map((c) => `/${c.command}`).join(", ")}.` : "All of its commands are already in your menu."}
                />
              )}
              <PartRow
                checked={parts.rules}
                onToggle={() => toggle("rules")}
                title={PART_LABELS.rules}
                detail={rules === null ? "Checking…" : `${newRules.length} new repl${newRules.length === 1 ? "y" : "ies"}${template.rules.length - newRules.length ? `, ${template.rules.length - newRules.length} you already have (kept)` : ""}.`}
              />
              {!listening && (
                <PartRow
                  checked={parts.monitoring}
                  onToggle={() => toggle("monitoring")}
                  title={PART_LABELS.monitoring}
                  detail={bot.webhook?.url ? "Not possible: this bot has a webhook (see Delivery)." : `Replies only work while the dashboard listens. This turns that on. ${MONITORING_WARNING}`}
                  disabled={Boolean(bot.webhook?.url)}
                />
              )}
            </ul>
            {!bot.hasToken && (
              <p className="mt-3 flex items-start gap-2 text-xs text-[var(--danger)]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Profile, commands and listening need the bot&apos;s token. Use “No token — fetch it” in the header first. Replies work without it.
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button onClick={() => void apply()} loading={applying} disabled={chosen.length === 0}>
                Add to @{bot.username}
              </Button>
              {results?.templateId === template.id && (
                <Button variant="outline" onClick={() => onOpen("builder")}>
                  Edit it in the conversation builder
                </Button>
              )}
            </div>
            {results?.templateId === template.id && (
              <ul className="mt-4 space-y-1 text-sm" aria-live="polite">
                {results.items.map((r) => (
                  <li key={r.part} className="flex items-start gap-2">
                    {r.errors.length ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" aria-hidden /> : <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" aria-hidden />}
                    <span>
                      <strong>{PART_LABELS[r.part]}:</strong> {r.applied} added{r.skipped ? `, ${r.skipped} kept` : ""}
                      {r.errors.map((e, i) => (
                        <span key={i} className="block text-xs text-[var(--danger)]">
                          {e}
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {(removable > 0 || removed?.templateId === template.id) && (
            <Card>
              <CardHeader>
                <CardTitle>Already added?</CardTitle>
              </CardHeader>
              {removable > 0 && plan && (
                <>
                  <p className="text-sm text-[var(--muted)]">
                    {plan.rules.length} repl{plan.rules.length === 1 ? "y" : "ies"}
                    {plan.commands.length ? ` and ${plan.commands.length} command${plan.commands.length === 1 ? "" : "s"}` : ""} on this bot are still exactly as this template made them.
                    {plan.keptRules.length + plan.keptCommands.length > 0 && " Ones you changed are kept."}
                  </p>
                  <Button variant="outline" className="mt-3 text-[var(--danger)]" onClick={() => setRemoveTarget(template)}>
                    <Trash2 className="h-4 w-4" aria-hidden /> Remove this template
                  </Button>
                </>
              )}
              {removed?.templateId === template.id && (
                <ul className="mt-3 space-y-1 text-sm" aria-live="polite">
                  {removed.items.map((r) => (
                    <li key={r.part} className="flex items-start gap-2">
                      {r.errors.length ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" aria-hidden /> : <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" aria-hidden />}
                      <span>
                        <strong>{r.part === "rules" ? "Automatic replies" : "Commands"}:</strong> {r.removed} removed
                        {r.kept.length > 0 && <span className="block text-xs text-[var(--muted)]">Kept because you changed them: {r.kept.join(", ")}</span>}
                        {r.errors.map((e, i) => (
                          <span key={i} className="block text-xs text-[var(--danger)]">
                            {e}
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        <PreviewCard key={template.id} template={template} bot={bot} photoSrc={photoSrc} extraCommands={newCommands} />
      </div>

      {removeDialog}

      <Dialog open={confirm === "delete"} onOpenChange={(o) => !o && !busy && setConfirm(null)}>
        <DialogContent>
          <DialogTitle>Delete “{template.title}”?</DialogTitle>
          <DialogDescription>The saved template is deleted. Bots that already used it keep what it added.</DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void deleteSaved()} loading={busy}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Confirm for "remove this template from the bot", shared by the gallery cards and the detail screen. */
function RemoveDialog({ template, plan, busy, onCancel, onConfirm }: { template: BotTemplate | null; plan: ReturnType<typeof planRemoval> | null; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Dialog open={template !== null} onOpenChange={(o) => !o && !busy && onCancel()}>
      <DialogContent>
        <DialogTitle>Remove “{template?.title}”?</DialogTitle>
        <DialogDescription>
          This deletes {plan?.rules.length ?? 0} repl{plan?.rules.length === 1 ? "y" : "ies"}
          {plan?.commands.length ? ` and ${plan.commands.length} command${plan.commands.length === 1 ? "" : "s"}` : ""} that are still exactly as the template made them. Anything you changed is kept. Your profile texts and the listening switch stay as they are.
        </DialogDescription>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={busy}>
            Remove
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The big phone: Try it (default; starts on the /start exchange) or a still Preview of the start message. */
function PreviewCard({ template, bot, photoSrc, extraCommands }: { template: BotTemplate; bot: BotDetail; photoSrc: string; extraCommands: { command: string; description: string }[] }) {
  const [tryIt, setTryIt] = useState(true);
  const startRule = template.rules.find((r) => r.matchType === "command" && r.pattern === "start");
  return (
    <Card className="xl:sticky xl:top-6">
      <CardHeader className="flex-wrap gap-2">
        <CardTitle>{tryIt ? "Try it" : "What people will see"}</CardTitle>
        <div role="group" aria-label="Show" className="inline-flex rounded-lg border border-[var(--card-border)] p-0.5 text-xs">
          {([true, false] as const).map((v) => (
            <button key={String(v)} type="button" aria-pressed={tryIt === v} onClick={() => setTryIt(v)} className={`rounded-md px-2.5 py-1 ${tryIt === v ? "bg-[var(--primary)] text-white" : "text-[var(--muted)]"}`}>
              {v ? "Try it" : "Preview"}
            </button>
          ))}
        </div>
      </CardHeader>
      {tryIt ? (
        <TemplateTry template={template} bot={bot} photoSrc={photoSrc} />
      ) : (
        <TelegramPreview
          mode="chat"
          botName={bot.name ?? bot.firstName}
          username={bot.username}
          photoSrc={photoSrc}
          commands={extraCommands.length ? [...(bot.commands ?? []), ...extraCommands] : bot.commands}
          messages={startRule ? [{ from: "user", text: "/start" }, { from: "bot", text: startRule.replyText, parseMode: startRule.parseMode, buttons: startRule.buttons }] : []}
        />
      )}
    </Card>
  );
}

function PartRow({ checked, onToggle, title, detail, disabled, children }: { checked: boolean; onToggle: () => void; title: string; detail: string; disabled?: boolean; children?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <input type="checkbox" className="mt-1" checked={checked && !disabled} disabled={disabled} onChange={onToggle} aria-label={title} />
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-xs text-[var(--muted)]">{detail}</p>
        {children}
      </div>
    </li>
  );
}

/** Plays a template's replies in the browser, before anything is added: the same matcher the real bot runs, nothing saved or sent. */
function TemplateTry({ template, bot, photoSrc }: { template: BotTemplate; bot: BotDetail; photoSrc: string }) {
  const rules: SimRule[] = template.rules.map((r) => ({
    enabled: r.enabled !== false,
    matchType: r.matchType,
    pattern: r.pattern,
    replyText: r.replyText,
    parseMode: r.parseMode ?? null,
    buttons: r.buttons ?? null,
    replyKeyboard: r.replyKeyboard ?? null,
    callbackAction: r.callbackAction ?? "toast",
    followUps: r.followUps,
  }));
  // It opens on what a person sees first: they press Start and the template's welcome comes back.
  const initial = () => (rules.some((r) => r.matchType === "command" && r.pattern === "start") ? simulateSend(emptySim(), rules, bot.username, "/start") : emptySim());
  const [sim, setSim] = useState(initial);
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-[var(--muted)]">Press the buttons or type like a customer. This runs the template here — nothing is added to your bot or sent to Telegram.</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => setSim(initial)}>
          <RotateCcw className="h-3.5 w-3.5" />
          Start over
        </Button>
      </div>
      {template.commands.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {template.commands.map((c) => (
            <Button key={c.command} type="button" variant="outline" size="sm" onClick={() => setSim((s) => simulateSend(s, rules, bot.username, `/${c.command}`))}>
              /{c.command}
            </Button>
          ))}
        </div>
      )}
      <TelegramPreview
        mode="chat"
        botName={bot.name ?? bot.firstName}
        username={bot.username}
        photoSrc={photoSrc}
        commands={template.commands}
        messages={sim.messages}
        keyboard={sim.keyboard}
        onSend={(text) => setSim((s) => simulateSend(s, rules, bot.username, text))}
        onShare={(kind) => setSim((s) => simulateShare(s, rules, bot.username, kind))}
        onButtonPress={(index, button) => setSim((s) => simulatePress(s, rules, index, button))}
      />
    </div>
  );
}

const SAVE_PARTS = [
  { id: "rules", label: "Automatic replies", hint: "All of them, in order, including ones switched off." },
  { id: "commands", label: "Commands menu", hint: "The default commands list (needs the bot's token)." },
  { id: "profile", label: "Profile texts", hint: "Short description and description (needs the bot's token)." },
] as const;

/** "Save this bot as a template": snapshots the bot's replies, commands and profile texts for reuse on any of your bots. */
function SaveDialog({ open, onOpenChange, bot, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; bot: BotDetail; onSaved: (template: BotTemplate) => void | Promise<void> }) {
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("⭐");
  const [blurb, setBlurb] = useState("");
  const [picked, setPicked] = useState<Record<string, boolean>>({ rules: true, commands: true, profile: true });
  const [saving, setSaving] = useState(false);
  const parts = SAVE_PARTS.filter((p) => picked[p.id]).map((p) => p.id);

  async function save() {
    setSaving(true);
    try {
      const r = await apiFetch<{ template: BotTemplate; notes: string[] }>("/api/custom-templates", { body: { botId: bot.id, title, emoji, blurb, parts } });
      toast.success("Template saved.");
      for (const note of r.notes) toast.message(note);
      onOpenChange(false);
      setTitle("");
      setBlurb("");
      await onSaved(r.template);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save the template.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent>
        <DialogTitle>Save @{bot.username} as a template</DialogTitle>
        <DialogDescription>Reuse what this bot has on your other bots. Templates are yours and work with every Telegram account you linked.</DialogDescription>
        <div className="space-y-3 overflow-y-auto">
          <div className="flex gap-2">
            <Input className="w-16 text-center" aria-label="Emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} />
            <Input aria-label="Template name" placeholder="Name, e.g. My shop bot" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={64} />
          </div>
          <Input aria-label="Short description" placeholder="What it is for (optional)" value={blurb} onChange={(e) => setBlurb(e.target.value)} maxLength={200} />
          <ul className="space-y-2 text-sm">
            {SAVE_PARTS.map((p) => (
              <li key={p.id} className="flex items-start gap-3">
                <input type="checkbox" className="mt-1" checked={picked[p.id]} onChange={() => setPicked((s) => ({ ...s, [p.id]: !s[p.id] }))} aria-label={p.label} />
                <div>
                  <p className="font-medium">{p.label}</p>
                  <p className="text-xs text-[var(--muted)]">{p.hint}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-[var(--muted)]">Buttons keep their IDs. On a bot that already has replies for the same buttons, those are skipped when you add the template, like any template.</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={saving} disabled={!title.trim() || parts.length === 0}>
            Save template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
