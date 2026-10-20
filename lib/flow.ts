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
