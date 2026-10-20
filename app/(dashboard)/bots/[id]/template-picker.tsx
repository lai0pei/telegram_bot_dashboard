"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { BOT_TEMPLATES, CUSTOM_CATEGORY, TEMPLATE_CATEGORIES, type BotTemplate, type TemplateCategory, type TemplatePart } from "@/lib/bot-templates";

export interface PartResult {
  part: TemplatePart;
  applied: number;
  skipped: number;
  errors: string[];
}

export const PART_LABELS: Record<TemplatePart, string> = {
  profile: "Profile texts",
  commands: "Commands menu",
  rules: "Automatic replies",
  monitoring: "Listening for messages",
};

/** Every part of a template; the new-bot page and the quick start use this, the Templates section lets people untick. */
export const ALL_PARTS: TemplatePart[] = ["profile", "commands", "rules", "monitoring"];

/** POSTs a template to a bot. Only the template's ID and the chosen parts travel; the server owns the content. */
export async function applyTemplateToBot(botId: number, templateId: string, parts: TemplatePart[], overwriteProfile = false): Promise<PartResult[]> {
  const r = await apiFetch<{ results: PartResult[] }>(`/api/bots/${botId}/templates`, { body: { templateId, parts, overwriteProfile } });
  return r.results;
}

/** Applying with a toast and the per-part results, shared by the Templates section and anything that offers a quick start. */
export function useApplyTemplate(botId: number, onApplied?: () => void) {
  const [applying, setApplying] = useState(false);
  const [results, setResults] = useState<{ templateId: string; items: PartResult[] } | null>(null);

  async function apply(template: BotTemplate, parts: TemplatePart[], overwriteProfile = false): Promise<PartResult[] | null> {
    setApplying(true);
    try {
      const items = await applyTemplateToBot(botId, template.id, parts, overwriteProfile);
      setResults({ templateId: template.id, items });
      onApplied?.();
      if (items.some((x) => x.errors.length)) toast.error("Some parts could not be added — see the list.");
      else toast.success(`${template.title} added.`);
      return items;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add the template.");
      return null;
    } finally {
      setApplying(false);
    }
  }

  return { apply, applying, results, clearResults: () => setResults(null) };
}

/** Built-in templates plus the ones this person saved (fetched once; `reload` after saving or deleting one). */
export function useTemplates() {
  const [custom, setCustom] = useState<BotTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(async () => {
    try {
      setCustom((await apiFetch<{ templates: BotTemplate[] }>("/api/custom-templates")).templates);
    } catch {
      // The built-in templates still work; saved ones just don't show.
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    // Intentional: fetch-on-mount into local state, not state synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);
  return { templates: [...BOT_TEMPLATES, ...custom], loaded, reload };
}

export function TemplateCard({ template, selected, onSelect }: { template: BotTemplate; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`card flex flex-col gap-1 p-4 text-left transition-shadow hover:shadow-md ${selected ? "ring-2 ring-[var(--primary)]" : ""}`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-2xl" aria-hidden>
          {template.emoji}
        </span>
        {template.featured && <span className="rounded-full bg-[var(--primary)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--primary)]">Start here</span>}
      </span>
      <span className="font-medium">{template.title}</span>
      <span className="text-xs text-[var(--muted)]">{template.blurb}</span>
      <span className="mt-1 flex flex-wrap gap-1">
        {template.shows.map((tag) => (
          <span key={tag} className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-[var(--muted)] dark:bg-white/5">
            {tag}
          </span>
        ))}
      </span>
      <span className="mt-1 text-xs text-[var(--muted)]">
        {template.rules.length} repl{template.rules.length === 1 ? "y" : "ies"} · {template.commands.length} command{template.commands.length === 1 ? "" : "s"}
      </span>
    </button>
  );
}

/**
 * The template cards as one radio group, with category chips. `selectedId` may be null (nothing chosen yet).
 * `compact` (cramped spots like the empty rules list) shows only the first category plus a "See all templates" button.
 */
export function TemplatePicker({
  selectedId,
  onSelect,
  className = "grid gap-3 sm:grid-cols-2 xl:grid-cols-4",
  compact = false,
  onMore,
  templates = BOT_TEMPLATES,
}: {
  selectedId: string | null;
  onSelect: (template: BotTemplate) => void;
  className?: string;
  compact?: boolean;
  onMore?: () => void;
  /** Defaults to the built-in ones; the Templates section passes in the saved ones too. */
  templates?: BotTemplate[];
}) {
  const [category, setCategory] = useState<TemplateCategory | typeof CUSTOM_CATEGORY | "All">("All");
  const hasCustom = templates.some((t) => t.custom);
  const shown = compact ? templates.filter((t) => t.category === TEMPLATE_CATEGORIES[0]) : templates.filter((t) => category === "All" || t.category === category);
  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Template category">
          {(["All", ...TEMPLATE_CATEGORIES, ...(hasCustom ? [CUSTOM_CATEGORY] : [])] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={`rounded-full px-3 py-1 text-xs ${category === c ? "bg-[var(--primary)] text-white" : "bg-black/5 text-[var(--muted)] dark:bg-white/5"}`}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      <div className={className} role="radiogroup" aria-label="Templates">
        {shown.map((t) => (
          <TemplateCard key={t.id} template={t} selected={t.id === selectedId} onSelect={() => onSelect(t)} />
        ))}
      </div>
      {compact && onMore && (
        <button type="button" onClick={onMore} className="text-sm text-[var(--primary)] hover:underline">
          See all {BOT_TEMPLATES.length} templates →
        </button>
      )}
    </div>
  );
}
