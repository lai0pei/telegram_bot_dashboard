import { NextResponse } from "next/server";
import { withRateLimit, withSession } from "@/lib/api-guard";
import { logError } from "@/lib/error-log";

/** A real crash report is a message and a stack; anything much bigger is not one. */
const MAX_BODY_BYTES = 8_000;

const report = withSession(async (req: Request) => {
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Report too large." }, { status: 413 });
  let body: { message?: unknown; stack?: unknown; path?: unknown; kind?: unknown } | null = null;
  try {
    body = JSON.parse(raw);
  } catch {
    // handled below
  }
  if (!body || typeof body.message !== "string" || !body.message) {
    return NextResponse.json({ error: "Send a `message`." }, { status: 400 });
  }
  // Rebuilt as an Error so it is scrubbed, fingerprinted and capped like a server error. Only the pathname is kept.
  const error = new Error(body.message.slice(0, 1_000));
  error.name = "ClientError";
  error.stack = typeof body.stack === "string" ? body.stack.slice(0, 4_000) : undefined;
  const path = typeof body.path === "string" ? body.path.split("?")[0].slice(0, 200) : undefined;
  logError("client", typeof body.kind === "string" ? body.kind.slice(0, 40) : "browser error", error, { path });
  return NextResponse.json({ ok: true });
});

/**
 * POST: the browser reports a render crash or unhandled error. Signed-in users only, rate limited per IP, and size
 * capped, because anyone with a session can call it.
 */
export const POST = withRateLimit((req: Request) => report(req, { params: Promise.resolve({}) }), {
  key: "client-errors",
  limit: 20,
  windowMs: 60_000,
});
