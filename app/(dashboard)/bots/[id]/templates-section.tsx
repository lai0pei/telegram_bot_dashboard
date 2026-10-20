"use client";

import { AlertTriangle, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-client";
import { BOT_TEMPLATES, templateRuleKey, type BotTemplate, type TemplatePart } from "@/lib/bot-templates";
import type { SectionId } from "./sections";
import { TelegramPreview } from "./telegram-preview";
import type { AutoReplyRule, BotDetail } from "./types";

interface PartResult {
  part: TemplatePart;
  applied: number;
  skipped: number;
  errors: string[];
}

const PART_LABELS: Record<TemplatePart, string> = {
  profile: "Profile texts",
  commands: "Commands menu",
  rules: "Automatic replies",
  monitoring: "Listening for messages",
};

/** Starter recipes: pick one, see exactly what it will add and how it looks, then apply it. Nothing existing is replaced. */
export function TemplatesSection({ bot, photoSrc, onChange, onOpen }: { bot: BotDetail; photoSrc: string; onChange: () => void; onOpen: (section: SectionId) => void }) {
  const [selectedId, setSelectedId] = useState<string>(BOT_TEMPLATES[0].id);
  const [rules, setRules] = useState<AutoReplyRule[] | null>(null);
  const [parts, setParts] = useState<Record<TemplatePart, boolean>>({ profile: true, commands: true, rules: true, monitoring: true });
  const [overwriteProfile, setOverwriteProfile] = useState(false);
  const [applying, setApplying] = useState(false);
  const [results, setResults] = useState<{ templateId: string; items: PartResult[] } | null>(null);
  // Bumped after applying, so the "already there" counts below refresh.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    apiFetch<{ rules: AutoReplyRule[] }>(`/api/bots/${bot.id}/auto-replies`)
      .then((r) => live && setRules(r.rules))
      .catch(() => live && setRules([]));
    return () => {
      live = false;
    };
  }, [bot.id, version]);

  const template = BOT_TEMPLATES.find((t) => t.id === selectedId)!;
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

  // Monitoring is only offered (and sent) when it is off and no webhook blocks it.
  const chosen = (Object.keys(parts) as TemplatePart[]).filter((p) => parts[p] && (p !== "monitoring" || (!listening && !bot.webhook?.url)));
  const toggle = (p: TemplatePart) => setParts((prev) => ({ ...prev, [p]: !prev[p] }));

  async function apply() {
    setApplying(true);
    try {
      const r = await apiFetch<{ results: PartResult[] }>(`/api/bots/${bot.id}/templates`, {
        body: { templateId: template.id, parts: chosen, overwriteProfile },
      });
      setResults({ templateId: template.id, items: r.results });
      setVersion((v) => v + 1);
      onChange();
      if (r.results.some((x) => x.errors.length)) toast.error("Some parts could not be added — see the list.");
      else toast.success(`${template.title} added.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add the template.");
    } finally {
      setApplying(false);
    }
  }

  const startRule = template.rules.find((r) => r.matchType === "command" && r.pattern === "start");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Start from a template</h2>
        <p className="text-sm text-[var(--muted)]">Pick a ready-made bot, check what it adds, and change anything afterwards. Nothing you already have is replaced.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="Templates">
        {BOT_TEMPLATES.map((t) => (
          <TemplateCard key={t.id} template={t} selected={t.id === selectedId} onSelect={() => { setSelectedId(t.id); setResults(null); }} />
        ))}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader>
            <CardTitle>
              {template.emoji} {template.title}
            </CardTitle>
          </CardHeader>
          <p className="mb-4 text-sm text-[var(--muted)]">{template.blurb}</p>
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
            <PartRow
              checked={parts.commands}
              onToggle={() => toggle("commands")}
              title={PART_LABELS.commands}
              detail={newCommands.length ? `Adds ${newCommands.map((c) => `/${c.command}`).join(", ")}.` : "All of its commands are already in your menu."}
            />
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
                detail={bot.webhook?.url ? "Not possible: this bot has a webhook (see Delivery)." : "Replies only work while the dashboard listens. This turns that on."}
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

        <Card className="xl:sticky xl:top-6">
          <CardHeader>
            <CardTitle>What people will see</CardTitle>
          </CardHeader>
          <TelegramPreview
            mode="chat"
            botName={bot.name ?? bot.firstName}
            username={bot.username}
            photoSrc={photoSrc}
            commands={newCommands.length ? [...(bot.commands ?? []), ...newCommands] : bot.commands}
            messages={startRule ? [{ from: "user", text: "/start" }, { from: "bot", text: startRule.replyText, parseMode: startRule.parseMode, buttons: startRule.buttons }] : []}
          />
        </Card>
      </div>
    </div>
  );
}

function TemplateCard({ template, selected, onSelect }: { template: BotTemplate; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`card flex flex-col gap-1 p-4 text-left transition-shadow hover:shadow-md ${selected ? "ring-2 ring-[var(--primary)]" : ""}`}
    >
      <span className="text-2xl" aria-hidden>
        {template.emoji}
      </span>
      <span className="font-medium">{template.title}</span>
      <span className="text-xs text-[var(--muted)]">{template.blurb}</span>
      <span className="mt-1 text-xs text-[var(--muted)]">
        {template.rules.length} repl{template.rules.length === 1 ? "y" : "ies"} · {template.commands.length} command{template.commands.length === 1 ? "" : "s"}
      </span>
    </button>
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
