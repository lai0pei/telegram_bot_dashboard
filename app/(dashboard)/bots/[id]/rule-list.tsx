"use client";

import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { RULE_MEDIA_LABELS } from "@/lib/rule-content";
import { conditionsSummary } from "@/lib/rule-conditions";
import { isCallbackType } from "./rule-draft";
import { CALLBACK_ACTION_LABELS } from "./rule-fields";
import type { AutoReplyMatchType, AutoReplyRule } from "./types";

export const MATCH_SHORT: Record<AutoReplyMatchType, string> = {
  command: "Command",
  exact: "Exact text",
  contains: "Contains",
  callback: "Button",
  callback_prefix: "Button (starts with)",
  deeplink: "Special link",
  media: "Media",
  shared: "Shared",
  fallback: "Anything else",
  starts_with: "Starts with",
  regex: "Pattern",
  member_joined: "Joins group",
  reaction: "Reaction",
};

export const ruleTitle = (r: Pick<AutoReplyRule, "matchType" | "pattern">) =>
  r.matchType === "command"
    ? `/${r.pattern}`
    : r.matchType === "fallback"
      ? "Any other message"
      : r.matchType === "member_joined"
        ? "Someone joins a group"
        : r.matchType === "reaction"
          ? r.pattern === "*" ? "Any reaction" : `Reacts ${r.pattern}`
          : r.pattern;

/**
 * The compact rule list: each row opens its rule in the editor (the text is one button; the switch and arrows sit beside
 * it, never inside it). `rules === null` = still loading. Editing and deleting live in the editor.
 */
export function RuleList({
  rules,
  selectedId,
  onSelect,
  onNew,
  onToggle,
  onMove,
  draft = null,
}: {
  rules: AutoReplyRule[] | null;
  selectedId: number | null;
  onSelect: (rule: AutoReplyRule) => void;
  onNew: () => void;
  onToggle: (rule: AutoReplyRule, enabled: boolean) => void;
  onMove: (rule: AutoReplyRule, move: "up" | "down") => void;
  /** The unsaved new rule, shown as a placeholder row so it's clear where it will land. */
  draft?: { matchType: AutoReplyMatchType; pattern: string } | null;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  // Keep the selected row visible inside the sticky list's own scroll area (e.g. a rule that was just added).
  useEffect(() => {
    if (selectedId === null) return;
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Automatic replies</h2>
        <Button size="sm" variant="outline" onClick={onNew}>
          <Plus className="h-4 w-4" aria-hidden /> New rule
        </Button>
      </div>
      <p className="text-xs text-[var(--muted)]">Checked top to bottom; the first match replies.</p>
      {rules === null ? (
        <Skeleton className="h-24" />
      ) : rules.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No rules yet.</p>
      ) : (
        <ul ref={listRef} className="divide-y divide-[var(--card-border)]">
          {rules.map((rule, i) => {
            const selected = rule.id === selectedId;
            return (
              <li key={rule.id} className={`flex items-center gap-2 py-2 ${selected ? "rounded-lg bg-[var(--primary)]/10 px-2" : ""}`}>
                <Switch checked={rule.enabled} onCheckedChange={(enabled) => onToggle(rule, enabled)} aria-label={`Enable ${ruleTitle(rule)}`} />
                <button type="button" className="min-w-0 flex-1 text-left" aria-current={selected ? "true" : undefined} onClick={() => onSelect(rule)}>
                  <span className="flex items-center gap-2 text-sm">
                    <Badge variant="primary">{MATCH_SHORT[rule.matchType]}</Badge>
                    <span className="truncate font-medium">{ruleTitle(rule)}</span>
                  </span>
                  <span className="block truncate text-xs text-[var(--muted)]">
                    {isCallbackType(rule.matchType) && rule.callbackAction !== "toast" ? `${CALLBACK_ACTION_LABELS[rule.callbackAction]}: ` : ""}
                    {rule.media ? `📎 ${RULE_MEDIA_LABELS[rule.media.kind].toLowerCase()}${rule.replyText ? ": " : ""}` : ""}
                    {rule.replyText}
                    {rule.followUps?.length ? ` · +${rule.followUps.length} more message${rule.followUps.length === 1 ? "" : "s"}` : ""}
                  </span>
                  {conditionsSummary(rule.matchType, rule.conditions).length > 0 && (
                    <span className="block truncate text-xs text-[var(--muted)]">{conditionsSummary(rule.matchType, rule.conditions).join(" · ")}</span>
                  )}
                  {rule.hits > 0 && (
                    <span className="block text-xs text-[var(--muted)]">
                      Used {rule.hits} time{rule.hits === 1 ? "" : "s"}
                    </span>
                  )}
                </button>
                {selected && (
                  <span className="flex shrink-0">
                    <Button variant="ghost" size="icon" disabled={i === 0} onClick={() => onMove(rule, "up")} aria-label="Move up">
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" disabled={i === rules.length - 1} onClick={() => onMove(rule, "down")} aria-label="Move down">
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </span>
                )}
              </li>
            );
          })}
          {draft && (
            <li className="rounded-lg bg-[var(--primary)]/10 px-2 py-2 text-sm" aria-current="true">
              <span className="font-medium">{draft.pattern.trim() ? ruleTitle(draft) : "New rule"}</span>
              <span className="block text-xs text-[var(--muted)]">not saved yet</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
