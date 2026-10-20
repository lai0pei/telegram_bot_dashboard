import type { InlineButton } from "./botapi";
import { findCallbackRule } from "./callback-match";

/** The slice of an auto-reply rule the conversation builder needs. */
export interface FlowRule {
  id: number;
  matchType: string;
  pattern: string;
  replyText: string;
  buttons: InlineButton[][] | null;
  enabled: boolean;
  /** Button answers only: a "toast" shows a small pop-up instead of a message. */
  callbackAction?: "toast" | "edit" | "reply";
}

/** One inline button of a step, resolved against the rules. */
export interface FlowButton {
  text: string;
  /** step: another reply answers it · loop: that reply is already earlier on this path · unlinked: no rule answers it · leaf: opens a link etc. */
  kind: "step" | "loop" | "unlinked" | "leaf";
  /** The button's callback data (step / loop / unlinked). */
  data?: string;
  target?: FlowRule;
}

export const isCallbackMatch = (r: Pick<FlowRule, "matchType">) => r.matchType === "callback" || r.matchType === "callback_prefix";

/** Rules a conversation can start from: everything but button answers. */
export const entryRules = <T extends FlowRule>(rules: readonly T[]): T[] => rules.filter((r) => !isCallbackMatch(r));

/**
 * A rule's buttons in row layout, each resolved to what pressing it does. `path` is the rules already shown on the way
 * here: a button leading back into it is a "loop" (a Back button) and is not expanded again.
 */
export function flowButtons(rule: FlowRule, rules: readonly FlowRule[], path: readonly number[] = []): FlowButton[][] {
  return (rule.buttons ?? []).map((row) =>
    row.map((b): FlowButton => {
      if (b.callback_data === undefined) return { text: b.text, kind: "leaf" };
      const target = findCallbackRule(rules, b.callback_data);
      if (!target) return { text: b.text, kind: "unlinked", data: b.callback_data };
      return { text: b.text, kind: path.includes(target.id) ? "loop" : "step", data: b.callback_data, target };
    })
  );
}

/** Every callback rule some entry point can reach by pressing buttons (a visited set, so loops terminate). */
export function reachableIds(rules: readonly FlowRule[]): Set<number> {
  const seen = new Set<number>();
  const queue = entryRules(rules).map((r) => r.id);
  while (queue.length) {
    const id = queue.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const rule = rules.find((r) => r.id === id);
    if (!rule) continue;
    for (const row of flowButtons(rule, rules)) for (const b of row) if (b.target && !seen.has(b.target.id)) queue.push(b.target.id);
  }
  return seen;
}

/** Button answers that no button leads to (typically left behind after deleting a button). */
export const unusedReplies = <T extends FlowRule>(rules: readonly T[]): T[] => {
  const reachable = reachableIds(rules);
  return rules.filter((r) => isCallbackMatch(r) && !reachable.has(r.id));
};

/** The rules that have a button leading to `rule`, i.e. what would be left with a dead button if it were deleted. */
export const pointingAt = <T extends FlowRule>(rule: FlowRule, rules: readonly T[]): T[] =>
  rules.filter((r) => r.id !== rule.id && flowButtons(r, rules).some((row) => row.some((b) => b.target?.id === rule.id)));

/** A callback ID for a new step: `<parent>_<label>` made of letters, digits and underscores, unique among the rules, at most 64 bytes. */
export function newStepId(parentPattern: string, label: string, rules: readonly FlowRule[], slug: (s: string) => string): string {
  const base = [slug(parentPattern), slug(label)].filter(Boolean).join("_").slice(0, 56) || "step";
  const taken = new Set(rules.map((r) => r.pattern));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
  return id;
}

/** A reply placed on the flow map: `depth` = how many button presses from a starting point (0 = a starting point itself). */
export interface GraphNode<T extends FlowRule = FlowRule> {
  rule: T;
  depth: number;
  /** Position within its column, in discovery order. */
  row: number;
}

/** A button leading from one reply to another. `back` = it points at a reply at the same or an earlier column (a Back/Menu button). */
export interface GraphEdge {
  from: number;
  to: number;
  label: string;
  back: boolean;
}

export interface FlowGraph<T extends FlowRule = FlowRule> {
  nodes: GraphNode<T>[];
  /** Node IDs grouped by depth: `columns[0]` = starting points. */
  columns: number[][];
  edges: GraphEdge[];
  /** Buttons that no rule answers, with the reply they sit on. */
  unlinked: { from: number; label: string; data: string }[];
  /** Button answers no button leads to (not on the map's columns; shown in a side lane). */
  unused: T[];
  /** The previous reply on the shortest route from a starting point (null for starting points); `pathTo` follows it. */
  parent: Map<number, number | null>;
}

/**
 * The whole conversation as a graph: starting points in column 0, then every reply one button press further, found by
 * breadth-first search (a visited set, so Back buttons and cycles terminate). Pure and shared with the builder's columns.
 */
export function flowGraph<T extends FlowRule>(rules: readonly T[]): FlowGraph<T> {
  const byId = new Map(rules.map((r) => [r.id, r]));
  const parent = new Map<number, number | null>();
  const depthOf = new Map<number, number>();
  const columns: number[][] = [];
  const queue: number[] = [];
  for (const r of entryRules(rules)) {
    parent.set(r.id, null);
    depthOf.set(r.id, 0);
    queue.push(r.id);
  }
  const edges: GraphEdge[] = [];
  const unlinked: FlowGraph["unlinked"] = [];
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    const depth = depthOf.get(id)!;
    (columns[depth] ??= []).push(id);
    const rule = byId.get(id)!;
    for (const row of flowButtons(rule, rules)) {
      for (const b of row) {
        if (b.kind === "unlinked") unlinked.push({ from: id, label: b.text, data: b.data! });
        if (!b.target) continue;
        const to = b.target.id;
        if (!depthOf.has(to)) {
          depthOf.set(to, depth + 1);
          parent.set(to, id);
          queue.push(to);
        }
        edges.push({ from: id, to, label: b.text, back: depthOf.get(to)! <= depth });
      }
    }
  }
  const nodes = columns.flatMap((ids, depth) => ids.map((id, row) => ({ rule: byId.get(id)!, depth, row })));
  return { nodes, columns, edges, unlinked, unused: rules.filter((r) => isCallbackMatch(r) && !depthOf.has(r.id)), parent };
}

/** The route of reply IDs from a starting point down to `id` (what the builder's columns call a path), or [] if unreachable. */
export function pathTo(graph: Pick<FlowGraph, "parent">, id: number): number[] {
  if (!graph.parent.has(id)) return [];
  const path: number[] = [];
  for (let cur: number | null | undefined = id; cur != null; cur = graph.parent.get(cur)) path.unshift(cur);
  return path;
}
