/**
 * Browser side of the error log: sends a crash to POST /api/client-errors.
 * Imported by client components, so it must stay free of server imports.
 * Best-effort and bounded, because it runs while something is already broken:
 * at most a few reports per page load, never the same one twice, and a
 * failed report is dropped silently (it must not cause another error).
 */
const MAX_REPORTS_PER_PAGE = 5;
let sent = 0;
const seen = new Set<string>();

export function reportClientError(kind: string, error: unknown): void {
  if (typeof window === "undefined") return;
  const err = error instanceof Error ? error : null;
  let message = err ? err.message : typeof error === "string" ? error : "Unknown error";
  // Server render errors reach the browser without their message; the digest is what links them to the server's entry.
  const digest = (error as { digest?: unknown } | null)?.digest;
  if (typeof digest === "string") message += ` (digest ${digest})`;

  const key = `${kind}|${message}`;
  if (sent >= MAX_REPORTS_PER_PAGE || seen.has(key)) return;
  seen.add(key);
  sent++;
  try {
    fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, message, stack: err?.stack, path: window.location.pathname }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // never let reporting throw
  }
}
