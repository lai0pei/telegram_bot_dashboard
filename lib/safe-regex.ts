/**
 * Which regular expressions a rule may use. The dashboard runs every tenant's rules in one Node process, and a
 * JavaScript regex can't be interrupted, so a "catastrophic" pattern such as `(a+)+$` would freeze all bots. This is a
 * conservative static check, not a proof: it refuses the shapes that blow up exponentially (a repeated group that
 * itself repeats or alternates, backreferences) and limits the polynomial ones (at most two open-ended repeats, tested
 * only on the first MAX_TEST_CHARS of a message, so the worst case is roughly 1000² steps).
 */
export const MAX_REGEX_LENGTH = 200;
export const MAX_TEST_CHARS = 1000;
const MAX_OPEN_REPEATS = 2;
const MAX_COUNTED_REPEAT = 100;

/** Error text if `source` can't be used as a rule's regular expression, else null. */
export function validateRegex(source: string): string | null {
  if (source.length > MAX_REGEX_LENGTH) return `A pattern is at most ${MAX_REGEX_LENGTH} characters.`;
  try {
    new RegExp(source, "i");
  } catch {
    return "That is not a valid regular expression.";
  }
  return unsafeReason(source);
}

function unsafeReason(source: string): string | null {
  if (/\\[1-9]|\\k</.test(source)) return "Backreferences (\\1) are not allowed in patterns.";
  if (/\(\?<?[!=]/.test(source)) return "Look-ahead and look-behind are not allowed in patterns.";

  // Walk the pattern once, tracking for each open group whether it contains a repeat or an alternation.
  const stack: { repeats: boolean; alternation: boolean }[] = [];
  let openRepeats = 0;
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (inClass) {
      if (ch === "]") inClass = false;
      continue;
    }
    if (ch === "[") inClass = true;
    else if (ch === "(") stack.push({ repeats: false, alternation: false });
    else if (ch === "|") {
      if (stack.length) stack[stack.length - 1].alternation = true;
    } else if (ch === ")") {
      const group = stack.pop();
      const q = quantifierAt(source, i + 1);
      if (group && q && (group.repeats || group.alternation) && q.max > 1) {
        return "A repeated group can't contain another repeat or a choice (|); it could make the bot hang.";
      }
      if (q && q.max > 1 && stack.length) stack[stack.length - 1].repeats = true;
      if (group && stack.length) {
        stack[stack.length - 1].repeats ||= group.repeats;
        stack[stack.length - 1].alternation ||= group.alternation;
      }
      if (q?.open) openRepeats++;
      if (q) i += q.length;
    } else {
      const q = quantifierAt(source, i);
      if (q) {
        if (q.max > MAX_COUNTED_REPEAT && q.max !== Infinity) return `A repeat count can be at most ${MAX_COUNTED_REPEAT}.`;
        if (q.max > 1 && stack.length) stack[stack.length - 1].repeats = true;
        if (q.open) openRepeats++;
        i += q.length - 1;
      }
    }
  }
  return openRepeats > MAX_OPEN_REPEATS ? `Use at most ${MAX_OPEN_REPEATS} open-ended repeats (* or +) in one pattern.` : null;
}

/** The quantifier starting at `at` (`*`, `+`, `?`, `{n}`, `{n,}`, `{n,m}`, each optionally lazy), if any. */
function quantifierAt(source: string, at: number): { length: number; max: number; open: boolean } | null {
  const ch = source[at];
  let length = 0;
  let max = 1;
  if (ch === "*" || ch === "+") {
    length = 1;
    max = Infinity;
  } else if (ch === "?") {
    length = 1;
  } else if (ch === "{") {
    const m = /^\{(\d+)(?:(,)(\d*))?\}/.exec(source.slice(at));
    if (!m) return null;
    length = m[0].length;
    max = m[2] ? (m[3] === "" ? Infinity : Number(m[3])) : Number(m[1]);
  } else {
    return null;
  }
  if (source[at + length] === "?") length++; // lazy
  return { length, max, open: max === Infinity };
}

declare global {
  var __tgDashRegexCache: Map<string, RegExp | null> | undefined;
}

/** The compiled, case-insensitive regex for a rule pattern, or null if it is unusable or unsafe. Cached. */
export function compileRuleRegex(source: string): RegExp | null {
  const cache = (globalThis.__tgDashRegexCache ??= new Map());
  if (cache.has(source)) return cache.get(source)!;
  const re = validateRegex(source) ? null : new RegExp(source, "i");
  if (cache.size > 500) cache.clear();
  cache.set(source, re);
  return re;
}
