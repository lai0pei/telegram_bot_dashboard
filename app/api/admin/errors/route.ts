import { NextResponse } from "next/server";
import { errorResponse, withAdmin } from "@/lib/api-guard";
import { buildDigest, listErrors, type ErrorStatus } from "@/lib/error-log";

const HOUR_MS = 60 * 60 * 1000;
const WINDOWS: Record<string, { ms: number | undefined; label: string }> = {
  "1h": { ms: HOUR_MS, label: "the last hour" },
  "24h": { ms: 24 * HOUR_MS, label: "the last 24 hours" },
  "7d": { ms: 7 * 24 * HOUR_MS, label: "the last 7 days" },
  "30d": { ms: 30 * 24 * HOUR_MS, label: "the last 30 days" },
  all: { ms: undefined, label: "all time" },
};
const STATUSES: ErrorStatus[] = ["open", "resolved", "all"];

/**
 * GET `?status=open|resolved|all&since=1h|24h|7d|30d|all&format=json|markdown`. Master admin only.
 * `json` (default) lists the errors; `markdown` returns a prompt-ready digest as plain text, so it can be pasted into
 * an LLM or fetched by a script. Errors are ranked by how often they occurred.
 */
export const GET = withAdmin(async (req: Request) => {
  try {
    const params = new URL(req.url).searchParams;
    const status = (params.get("status") ?? "open") as ErrorStatus;
    const window = WINDOWS[params.get("since") ?? "7d"];
    const format = params.get("format") ?? "json";
    if (!STATUSES.includes(status) || !window || (format !== "json" && format !== "markdown")) {
      return NextResponse.json({ error: "Invalid status, since or format." }, { status: 400 });
    }

    const errors = await listErrors({ status, sinceMs: window.ms });
    if (format === "markdown") {
      return new Response(buildDigest(errors, window.label), {
        headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    return NextResponse.json({ errors });
  } catch (err) {
    return errorResponse(err);
  }
});
