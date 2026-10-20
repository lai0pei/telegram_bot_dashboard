import { createHash } from "node:crypto";
import { and, desc, eq, gte, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "./db";
import { appErrors } from "./db/schema";

/**
 * Durable, de-duplicated error log. `logError` is what code calls instead of a
 * bare console.error: it still prints (so `docker compose logs` is unchanged)
 * and also stores one row per distinct problem for the Admin → Errors tab,
 * which can export them as a prompt for an LLM.
 *
 * Two rules keep this safe to call from anywhere, including failure paths:
 * it never throws and never calls itself (a database outage only costs the
 * stored copy), and everything is scrubbed of secrets *before* it is stored,
 * because the export leaves the server.
 */

const STACK_MAX = 4_000;
const MESSAGE_MAX = 1_000;
const CONTEXT_MAX = 2_000;
const WHAT_MAX = 200;
/** A given problem is written to the database at most this often; repeats in between are counted in memory and added with the next write. */
const WRITE_INTERVAL_MS = 10_000;
const MAX_TRACKED = 500;

// --- Scrubbing ----------------------------------------------------------------------------------

/** Context keys whose values are never stored: user-written text and credentials. */
const SENSITIVE_KEY = /^(text|caption|message_?text|body|password|pass|token|secret|session|phone|authorization|cookie|api_?hash)$/i;

/** Values of these env vars are removed wherever they appear (shorter than 6 chars would match too much to be safe to replace). */
function secretValues(): string[] {
  return [process.env.APP_SECRET, process.env.API_HASH, process.env.POSTGRES_PASSWORD].filter(
    (v): v is string => !!v && v.length >= 6
  );
}

export function scrub(text: string): string {
  let out = text;
  for (const secret of secretValues()) out = out.split(secret).join("[REDACTED]");
  // Stack frames carry the server's absolute install path (often a home directory); the relative part is what helps.
  const cwd = process.cwd();
  if (cwd.length > 3) out = out.split(cwd).join("<app>");
  return out
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{30,}/g, "[REDACTED_BOT_TOKEN]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[REDACTED_JWT]")
    // A Telegram StringSession: a version digit followed by a long base64 blob.
    .replace(/\b1[A-Za-z0-9+/=_-]{200,}/g, "[REDACTED_SESSION]")
    .replace(/(postgres(?:ql)?:\/\/)([^:@\s/]+):([^@\s/]+)@/gi, "$1$2:[REDACTED]@")
    .replace(/(?<![\w.])\+\d{7,15}\b/g, "[REDACTED_PHONE]");
}

function cap(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function scrubContext(context: Record<string, unknown> | undefined): string | null {
  if (!context) return null;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    safe[key] = SENSITIVE_KEY.test(key) ? "[omitted]" : value;
  }
  try {
    return cap(scrub(JSON.stringify(safe)), CONTEXT_MAX);
  } catch {
    return null; // unserialisable (circular) context: drop it rather than fail
  }
}

// --- Fingerprint --------------------------------------------------------------------------------

/** Numbers vary per occurrence (IDs, ports, line numbers) but don't make it a different problem. */
function normalise(text: string): string {
  return text.replace(/\d+/g, "N").replace(/\s+/g, " ").trim().slice(0, 200);
}

function topFrames(stack: string | undefined): string {
  if (!stack) return "";
  return stack
    .split("\n")
    .filter((line) => line.trim().startsWith("at "))
    .slice(0, 3)
    .map(normalise)
    .join("|");
}

function fingerprint(source: string, what: string, name: string, message: string, stack: string | undefined): string {
  return createHash("sha256")
    .update([source, normalise(what), name, normalise(message), topFrames(stack)].join("\u0000"))
    .digest("hex")
    .slice(0, 32);
}

// --- Recording ----------------------------------------------------------------------------------

declare global {
  var __tgDashErrorLog: Map<string, { lastWrite: number; pending: number }> | undefined;
}

function tracker() {
  return (globalThis.__tgDashErrorLog ??= new Map());
}

/**
 * Prints the error (as the old console.error calls did) and stores it. `what`
 * says what was being attempted ("bot foo getUpdates failed"); `context` holds
 * small non-sensitive facts such as a bot ID. Fire-and-forget.
 */
export function logError(source: string, what: string, err: unknown, context?: Record<string, unknown>): void {
  console.error(`[${source}] ${what}:`, err);
  record(source, what, err, context).catch(() => {
    // Best-effort by design: the console line above is the fallback.
  });
}

async function record(source: string, what: string, err: unknown, context?: Record<string, unknown>): Promise<void> {
  const error = err instanceof Error ? err : new Error(typeof err === "string" ? err : "Non-Error value thrown");
  const name = error.name || "Error";
  const message = cap(scrub(error.message), MESSAGE_MAX);
  const stack = error.stack ? cap(scrub(error.stack), STACK_MAX) : undefined;
  const safeWhat = cap(scrub(what), WHAT_MAX);
  const key = fingerprint(source, safeWhat, name, message, stack);

  // A flood of the same error is counted here and written at most once per interval.
  const seen = tracker();
  const now = Date.now();
  const entry = seen.get(key);
  if (entry && now - entry.lastWrite < WRITE_INTERVAL_MS) {
    entry.pending++;
    return;
  }
  const extra = entry?.pending ?? 0;
  if (!entry && seen.size >= MAX_TRACKED) seen.delete(seen.keys().next().value as string);
  seen.set(key, { lastWrite: now, pending: 0 });

  const at = new Date(now);
  await db
    .insert(appErrors)
    .values({
      fingerprint: key,
      source,
      what: safeWhat,
      errorName: name,
      message,
      stack: stack ?? null,
      context: scrubContext(context),
      count: 1 + extra,
      firstSeenAt: at,
      lastSeenAt: at,
    })
    .onConflictDoUpdate({
      target: appErrors.fingerprint,
      set: {
        count: sql`${appErrors.count} + ${1 + extra}`,
        lastSeenAt: at,
        message,
        stack: stack ?? null,
        context: scrubContext(context),
        // A problem that comes back after being marked resolved is open again.
        resolvedAt: null,
      },
    });
}

// --- Reading, resolving, retention --------------------------------------------------------------

export type ErrorStatus = "open" | "resolved" | "all";

export interface ErrorDto {
  id: number;
  source: string;
  what: string;
  errorName: string;
  message: string;
  stack: string | null;
  context: Record<string, unknown> | null;
  count: number;
  firstSeenAt: number;
  lastSeenAt: number;
  resolved: boolean;
}

function toDto(row: typeof appErrors.$inferSelect): ErrorDto {
  let context: Record<string, unknown> | null = null;
  if (row.context) {
    try {
      context = JSON.parse(row.context) as Record<string, unknown>;
    } catch {
      context = null;
    }
  }
  return {
    id: row.id,
    source: row.source,
    what: row.what,
    errorName: row.errorName,
    message: row.message,
    stack: row.stack,
    context,
    count: row.count,
    firstSeenAt: row.firstSeenAt.getTime(),
    lastSeenAt: row.lastSeenAt.getTime(),
    resolved: row.resolvedAt !== null,
  };
}

/** Most frequent first, then most recent. `sinceMs` filters on last seen; omit for all time. */
export async function listErrors(options: { status: ErrorStatus; sinceMs?: number; limit?: number }): Promise<ErrorDto[]> {
  const filters = [
    options.status === "open" ? isNull(appErrors.resolvedAt) : options.status === "resolved" ? isNotNull(appErrors.resolvedAt) : undefined,
    options.sinceMs ? gte(appErrors.lastSeenAt, new Date(Date.now() - options.sinceMs)) : undefined,
  ].filter((f) => f !== undefined);
  const rows = await db
    .select()
    .from(appErrors)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(appErrors.count), desc(appErrors.lastSeenAt))
    .limit(options.limit ?? 200);
  return rows.map(toDto);
}

/** Returns false if there is no such error. */
export async function setErrorResolved(id: number, resolved: boolean): Promise<boolean> {
  const rows = await db
    .update(appErrors)
    .set({ resolvedAt: resolved ? new Date() : null })
    .where(eq(appErrors.id, id))
    .returning({ id: appErrors.id });
  return rows.length === 1;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Deletes errors resolved over 30 days ago and any not seen for 90 days. */
export async function pruneErrors(now = Date.now()): Promise<void> {
  await db
    .delete(appErrors)
    .where(
      or(lt(appErrors.resolvedAt, new Date(now - 30 * DAY_MS)), lt(appErrors.lastSeenAt, new Date(now - 90 * DAY_MS)))
    );
}

declare global {
  var __tgDashLastErrorPruneDay: string | undefined;
}

/** Called from the job tick; prunes at most once per UTC day. The flag is set before the first await so overlapping ticks can't both run it. */
export async function maybePruneErrors(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if (globalThis.__tgDashLastErrorPruneDay === today) return;
  globalThis.__tgDashLastErrorPruneDay = today;
  await pruneErrors();
}

// --- LLM export ---------------------------------------------------------------------------------

const DIGEST_MAX_ENTRIES = 20;
const DIGEST_MAX_BYTES = 30_000;
const DIGEST_STACK_MAX = 1_500;
const DIGEST_FRAMES = 12;

/**
 * Just the stack frames, with library and Node internals dropped: for an LLM the app's own frames are the signal,
 * and framework frames would use up the size budget. Falls back to the first frames if nothing app-owned remains.
 */
function compactStack(stack: string): string {
  const frames = stack.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("at "));
  const own = frames.filter((l) => !l.includes("node_modules/") && !l.includes("node:"));
  return (own.length > 0 ? own : frames).slice(0, DIGEST_FRAMES).map((l) => `    ${l}`).join("\n");
}

/**
 * A prompt-ready summary of the errors given (already ranked): the instruction
 * first, then each error with its counts, context and a trimmed stack. Capped
 * so it fits comfortably in one message; says how many were left out.
 */
export function buildDigest(errors: ErrorDto[], windowLabel: string, generatedAt = new Date()): string {
  const header = [
    "# Production errors: Telegram Bot Dashboard",
    "",
    `Stack: Next.js 16 (App Router), React 19, Postgres via Drizzle, MTProto via teleproto, Telegram Bot API poller and background jobs. Window: ${windowLabel}. Generated ${generatedAt.toISOString()}.`,
    "",
    "Task: for each error below, give the most likely root cause and a minimal fix, ranked by impact. If an error needs more information to diagnose, say exactly what to look for. Secrets, phone numbers and message text were removed before export. Stack frames inside libraries are omitted.",
    "",
    "",
  ].join("\n");

  let out = header;
  let shown = 0;
  for (const [i, e] of errors.slice(0, DIGEST_MAX_ENTRIES).entries()) {
    const compact = e.stack ? compactStack(e.stack).slice(0, DIGEST_STACK_MAX) : "";
    const stack = compact || null;
    const block = [
      `## ${i + 1}. [${e.source}] ${e.what}`,
      `- Error: ${e.errorName}: ${e.message}`,
      `- Occurrences: ${e.count} (first ${new Date(e.firstSeenAt).toISOString()}, last ${new Date(e.lastSeenAt).toISOString()})`,
      `- Status: ${e.resolved ? "resolved" : "open"}`,
      ...(e.context ? [`- Context: ${JSON.stringify(e.context)}`] : []),
      ...(stack ? ["", "```", stack, "```"] : []),
      "",
      "",
    ].join("\n");
    if (out.length + block.length > DIGEST_MAX_BYTES) break;
    out += block;
    shown++;
  }
  if (errors.length === 0) out += "No errors in this window.\n";
  else if (shown < errors.length) out += `\n(${errors.length - shown} more error(s) not shown, lower in the ranking.)\n`;
  return out;
}
