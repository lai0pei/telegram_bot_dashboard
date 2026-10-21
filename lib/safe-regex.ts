/**
 * Which regular expressions a rule may use. The dashboard runs every tenant's rules in one Node process, and a
 * JavaScript regex can't be interrupted, so a "catastrophic" pattern such as `(a+)+$` would freeze all bots. This is a
 * conservative static check, **not a proof** (the real fixes would be RE2 or a worker with a timeout): it refuses the
 * shapes that blow up exponentially (a repeated group that itself repeats or alternates, backreferences, look-around)
 * and bounds the rest by counting every ambiguous quantifier. Two open-ended repeats still cost about n³ steps in the
 * worst case (measured: ~9 ms at 200 characters, ~130 ms at 500, ~1 s at 2000), so only messages up to MAX_TEST_CHARS
 * are ever tested; a longer one never matches a pattern rule (truncating it instead would let a `$` match in the
 * middle of a message).
 *
 * A quantifier is "ambiguous" when it can match a varying number of times: `*`, `+`, `{n,}`, `{n,m}` with n < m.
 * `{n}` is exact and free. `?` is cheap alone but chains (`a?a?a?aaa`) multiply, so they are capped separately.
 */
export const MAX_REGEX_LENGTH = 200;
export const MAX_TEST_CHARS = 200;
const MAX_AMBIGUOUS_REPEATS = 2;
const MAX_OPTIONALS = 8;
const MAX_ALTERNATIONS = 10;
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

  // Walk the pattern once, tracking for each open group whether it contains an ambiguous repeat or an alternation.
  const stack: { repeats: boolean; alternation: boolean }[] = [];
  let repeats = 0;
  let optionals = 0;
  let alternations = 0;
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
      alternations++;
      if (stack.length) stack[stack.length - 1].alternation = true;
    } else if (ch === ")") {
      const group = stack.pop();
      const q = quantifierAt(source, i + 1);
      // Any repeat count counts here: `(.*a){10}` is polynomial with a high exponent even though {10} is exact.
      if (group && q && q.max > 1 && (group.repeats || group.alternation)) {
        return "A repeated group can't contain another repeat or a choice (|); it could make the bot hang.";
      }
      if (q?.ambiguous) repeats++;
      else if (q?.optional) optionals++;
      if (stack.length) {
        const parent = stack[stack.length - 1];
        parent.repeats ||= (group?.repeats ?? false) || Boolean(q?.ambiguous);
        parent.alternation ||= group?.alternation ?? false;
      }
      if (q) i += q.length;
    } else {
      const q = quantifierAt(source, i);
      if (q) {
        if (q.max > MAX_COUNTED_REPEAT && q.max !== Infinity) return `A repeat count can be at most ${MAX_COUNTED_REPEAT}.`;
        if (q.ambiguous) {
          repeats++;
          if (stack.length) stack[stack.length - 1].repeats = true;
        } else if (q.optional) optionals++;
        i += q.length - 1;
      }
    }
  }
  if (repeats > MAX_AMBIGUOUS_REPEATS) {
    return `Use at most ${MAX_AMBIGUOUS_REPEATS} repeating parts (*, +, {n,m}) in one pattern; more can make the bot hang. Exact counts like {4} are fine.`;
  }
  if (optionals > MAX_OPTIONALS) return `Use at most ${MAX_OPTIONALS} optional parts (?) in one pattern.`;
  if (alternations > MAX_ALTERNATIONS) return `Use at most ${MAX_ALTERNATIONS} choices (|) in one pattern.`;
  return null;
}

interface Quantifier {
  length: number;
  max: number;
  /** Can match a varying number of times (more than one possible count above one). */
  ambiguous: boolean;
  /** Plain `?` (zero or one). */
  optional: boolean;
}

/** The quantifier starting at `at` (`*`, `+`, `?`, `{n}`, `{n,}`, `{n,m}`, each optionally lazy), if any. */
function quantifierAt(source: string, at: number): Quantifier | null {
  const ch = source[at];
  let length = 0;
  let min = 1;
  let max = 1;
  if (ch === "*" || ch === "+") {
    length = 1;
    min = ch === "*" ? 0 : 1;
    max = Infinity;
  } else if (ch === "?") {
    length = 1;
    min = 0;
  } else if (ch === "{") {
    const m = /^\{(\d+)(?:(,)(\d*))?\}/.exec(source.slice(at));
    if (!m) return null;
    length = m[0].length;
    min = Number(m[1]);
    max = m[2] ? (m[3] === "" ? Infinity : Number(m[3])) : min;
  } else {
    return null;
  }
  if (source[at + length] === "?") length++; // lazy
  return { length, max, ambiguous: max > 1 && min < max, optional: min === 0 && max === 1 };
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
