"use client";

import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, CornerDownLeft, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ruleTree, type RuleTreeNode } from "@/lib/flow";
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

/** Collapsed branches are remembered per bot in this browser (a convenience; the tree works without it). */
const collapsedKey = (botId: number) => `tgdash-rule-tree-collapsed:${botId}`;

function loadCollapsed(botId: number): Set<number> {
  try {
    const raw = window.localStorage.getItem(collapsedKey(botId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is number => typeof x === "number") : []);
  } catch {
    return new Set();
  }
}

interface RowContext {
  selectedId: number | null;
  collapsed: Set<number>;
  rootIds: number[];
  onSelect: (rule: AutoReplyRule) => void;
  onToggle: (rule: AutoReplyRule, enabled: boolean) => void;
  onMove: (rule: AutoReplyRule, move: "up" | "down") => void;
  onCollapse: (id: number) => void;
}

/** What a rule answers, in one or two muted lines under its title. */
function RuleSummary({ rule }: { rule: AutoReplyRule }) {
  const conditions = conditionsSummary(rule.matchType, rule.conditions);
  return (
    <>
      <span className="block truncate text-xs text-[var(--muted)]">
        {isCallbackType(rule.matchType) && rule.callbackAction !== "toast" ? `${CALLBACK_ACTION_LABELS[rule.callbackAction]}: ` : ""}
        {rule.media ? `📎 ${RULE_MEDIA_LABELS[rule.media.kind].toLowerCase()}${rule.replyText ? ": " : ""}` : ""}
        {rule.replyText}
        {rule.followUps?.length ? ` · +${rule.followUps.length} more message${rule.followUps.length === 1 ? "" : "s"}` : ""}
      </span>
      {conditions.length > 0 && <span className="block truncate text-xs text-[var(--muted)]">{conditions.join(" · ")}</span>}
      {rule.hits > 0 && (
        <span className="block text-xs text-[var(--muted)]">
          Used {rule.hits} time{rule.hits === 1 ? "" : "s"}
        </span>
      )}
    </>
  );
}

function TreeItems({ nodes, level, ctx }: { nodes: RuleTreeNode<AutoReplyRule>[]; level: number; ctx: RowContext }) {
  return (
    <ul role={level === 1 ? "tree" : "group"} className={level === 1 ? "space-y-0.5" : "ml-3 space-y-0.5 border-l border-[var(--card-border)] pl-2"}>
      {nodes.map((node) => (
        <TreeItem key={node.rule.id} node={node} level={level} ctx={ctx} />
      ))}
    </ul>
  );
}

function TreeItem({ node, level, ctx }: { node: RuleTreeNode<AutoReplyRule>; level: number; ctx: RowContext }) {
  const { rule } = node;
  const selected = rule.id === ctx.selectedId;
  const hasChildren = node.children.length > 0;
  const open = !ctx.collapsed.has(rule.id);
  const rootIndex = ctx.rootIds.indexOf(rule.id);
  // A reply reached through a button is named after that button; its hidden ID stays in the tooltip.
  const title = node.via.length ? node.via.join(" / ") : ruleTitle(rule);
  return (
    <li role="treeitem" aria-level={level} aria-expanded={hasChildren ? open : undefined} aria-selected={selected}>
      <div className={`flex items-center gap-1.5 rounded-lg py-1.5 pr-1 ${selected ? "bg-[var(--primary)]/10" : ""}`}>
        {hasChildren ? (
          <button
            type="button"
            onClick={() => ctx.onCollapse(rule.id)}
            aria-label={`${open ? "Collapse" : "Expand"} ${title}`}
            className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            {open ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
          </button>
        ) : (
          <span className="w-5 shrink-0" aria-hidden />
        )}
        <Switch checked={rule.enabled} onCheckedChange={(enabled) => ctx.onToggle(rule, enabled)} aria-label={`Enable ${title}`} />
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          aria-current={selected ? "true" : undefined}
          title={node.via.length ? `Button ID: ${rule.pattern}` : undefined}
          onClick={() => ctx.onSelect(rule)}
        >
          <span className="flex items-center gap-2 text-sm">
            <Badge variant="primary">{MATCH_SHORT[rule.matchType]}</Badge>
            <span className="truncate font-medium">{title}</span>
            {hasChildren && !open && <span className="shrink-0 text-xs text-[var(--muted)]">+{countDescendants(node)}</span>}
          </span>
          <RuleSummary rule={rule} />
          {node.links.length > 0 && (
            <span className="block truncate text-xs text-[var(--muted)]">
              <CornerDownLeft className="mr-1 inline h-3 w-3" aria-hidden />
              {node.links.map((l) => `${l.label} → ${l.rule.matchType === "callback" || l.rule.matchType === "callback_prefix" ? l.rule.pattern : ruleTitle(l.rule)}`).join(" · ")}
            </span>
          )}
        </button>
        {selected && rootIndex >= 0 && (
          <span className="flex shrink-0">
            <Button variant="ghost" size="icon" disabled={rootIndex === 0} onClick={() => ctx.onMove(rule, "up")} aria-label="Move up">
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" disabled={rootIndex === ctx.rootIds.length - 1} onClick={() => ctx.onMove(rule, "down")} aria-label="Move down">
              <ArrowDown className="h-4 w-4" />
            </Button>
          </span>
        )}
      </div>
      {hasChildren && open && <TreeItems nodes={node.children} level={level + 1} ctx={ctx} />}
    </li>
  );
}

const countDescendants = (node: RuleTreeNode<AutoReplyRule>): number => node.children.reduce((n, c) => n + 1 + countDescendants(c), 0);

/**
 * The rules as a conversation tree: starting rules (checked top to bottom, the first match replies) with each button
 * answer nested under the reply whose button leads to it; answers no button reaches sit in an "Unused" group. A row's
 * text selects the rule (the page previews it and offers to edit); the chevron, switch and arrows sit beside it, never
 * inside it. `rules === null` = still loading.
 */
export function RuleList({
  botId,
  rules,
  selectedId,
  onSelect,
  onNew,
  onToggle,
  onMove,
}: {
  botId: number;
  rules: AutoReplyRule[] | null;
  selectedId: number | null;
  onSelect: (rule: AutoReplyRule) => void;
  onNew: () => void;
  onToggle: (rule: AutoReplyRule, enabled: boolean) => void;
  onMove: (rule: AutoReplyRule, move: "up" | "down") => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const [unusedOpen, setUnusedOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Intentional: read this browser's remembered state after mount (not during render, so the server HTML matches).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(loadCollapsed(botId));
  }, [botId]);

  const tree = useMemo(() => (rules ? ruleTree(rules) : null), [rules]);

  function toggleCollapsed(id: number) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      try {
        window.localStorage.setItem(collapsedKey(botId), JSON.stringify([...next]));
      } catch {
        // Not remembered; the tree still works.
      }
      return next;
    });
  }

  // Keep the selected row visible inside the list's own scroll area (e.g. a rule that was just added).
  useEffect(() => {
    if (selectedId === null) return;
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const ctx: RowContext | null = tree && {
    selectedId,
    collapsed,
    rootIds: tree.roots.map((n) => n.rule.id),
    onSelect,
    onToggle,
    onMove,
    onCollapse: toggleCollapsed,
  };
  const unusedSelected = tree?.unused.some((r) => r.id === selectedId) ?? false;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Automatic replies</h2>
        <Button size="sm" variant="outline" onClick={onNew}>
          <Plus className="h-4 w-4" aria-hidden /> New rule
        </Button>
      </div>
      <p className="text-xs text-[var(--muted)]">
        Starting rules are checked top to bottom; the first match replies. Replies to buttons are nested under the message that has the button.
      </p>
      {rules === null || tree === null || ctx === null ? (
        <Skeleton className="h-24" />
      ) : rules.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No rules yet.</p>
      ) : (
        <div ref={listRef} className="space-y-2">
          <TreeItems nodes={tree.roots} level={1} ctx={ctx} />
          {tree.unused.length > 0 && (
            <div className="border-t border-[var(--card-border)] pt-2">
              <button
                type="button"
                onClick={() => setUnusedOpen((o) => !o)}
                aria-expanded={unusedOpen || unusedSelected}
                className="flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                {unusedOpen || unusedSelected ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                Unused button replies ({tree.unused.length})
              </button>
              <p className="ml-5 text-xs text-[var(--muted)]">No button leads to these any more.</p>
              {(unusedOpen || unusedSelected) && (
                <TreeItems
                  nodes={tree.unused.map((rule) => ({ rule, via: [], links: [], children: [] }))}
                  level={1}
                  ctx={{ ...ctx, rootIds: [] }}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
