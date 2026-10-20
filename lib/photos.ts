import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { singleFlight } from "./single-flight";

/**
 * Process-wide cache of downloaded profile photos (small size). Lists show a
 * photo per card, so without it every page load would fan out into one MTProto
 * download per bot/chat and invite FLOOD_WAITs. "No photo" is cached too.
 * Keys must include the Telegram account ID — the cache is shared by all users.
 */
interface PhotoEntry {
  buf: Buffer | null;
  expiresAt: number;
}

declare global {
  var __tgDashPhotoCache: Map<string, PhotoEntry> | undefined;
}

const TTL_MS = 30 * 60 * 1000;
const FAILURE_TTL_MS = 60 * 1000;
const MAX_ENTRIES = 500;
/** A fetch that takes longer is abandoned so it can't hold one of the few concurrency slots forever. */
const FETCH_TIMEOUT_MS = 20 * 1000;

function cache(): Map<string, PhotoEntry> {
  return (globalThis.__tgDashPhotoCache ??= new Map());
}

export type PhotoKind = "bot" | "chat" | "bot-chat";

export function photoKey(telegramAccountId: string, kind: PhotoKind, id: number | string): string {
  return `photo:${telegramAccountId}:${kind}:${id}`;
}

/** At most this many photo fetches run at once per process: they share the Telegram account's request budget. */
const MAX_CONCURRENT_FETCHES = 3;

declare global {
  var __tgDashPhotoSlots: { active: number; waiting: (() => void)[] } | undefined;
}

async function withFetchSlot<T>(fn: () => Promise<T>): Promise<T> {
  const slots = (globalThis.__tgDashPhotoSlots ??= { active: 0, waiting: [] });
  if (slots.active >= MAX_CONCURRENT_FETCHES) await new Promise<void>((resolve) => slots.waiting.push(resolve));
  else slots.active++;
  try {
    return await fn();
  } finally {
    const next = slots.waiting.shift();
    if (next) next(); // hand the slot straight to the next waiter
    else slots.active--;
  }
}

/** Seconds from a Telegram "FLOOD_WAIT_n" error (RPC or Bot API "retry after n"), if that's what `err` is. */
function floodWaitSeconds(err: unknown): number | null {
  const message = err instanceof Error ? err.message : "";
  const match = /FLOOD_WAIT_(\d+)/.exec(message) ?? /retry after (\d+)/i.exec(message);
  return match ? Number(match[1]) : null;
}

/** The cached photo for `key`, or the result of `fetcher` (single-flighted). `null` means "no photo". */
export async function getCachedPhoto(key: string, fetcher: () => Promise<Buffer | null>): Promise<Buffer | null> {
  const hit = cache().get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.buf;

  return singleFlight(key, () =>
    withFetchSlot(async () => {
      try {
        const buf = await withTimeout(fetcher(), FETCH_TIMEOUT_MS);
        remember(key, { buf, expiresAt: Date.now() + TTL_MS });
        return buf;
      } catch (err) {
        // Remember the failure so a list of avatars doesn't hammer Telegram while it's erroring
        // (for as long as Telegram asked us to wait, when it said so).
        const wait = floodWaitSeconds(err);
        remember(key, { buf: null, expiresAt: Date.now() + (wait ? wait * 1000 : FAILURE_TTL_MS) });
        throw err;
      }
    })
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Timed out fetching the photo from Telegram.")), ms);
  });
  // The underlying call may keep running after a timeout; its result is simply dropped.
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function remember(key: string, entry: PhotoEntry): void {
  const map = cache();
  map.delete(key);
  map.set(key, entry);
  // Maps iterate in insertion order, so the first key is the oldest.
  while (map.size > MAX_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

export function invalidatePhoto(key: string): void {
  cache().delete(key);
}

/**
 * The JPEG, or 404 when there is none. The browser revalidates every time (ETag -> cheap 304 served from the
 * server cache) instead of trusting a max-age, so a changed or removed photo shows up on the next view.
 */
export function photoResponse(req: Request, buf: Buffer | null): Response {
  if (!buf || buf.length === 0) {
    return NextResponse.json({ error: "No profile photo." }, { status: 404, headers: { "Cache-Control": "private, no-cache" } });
  }
  const etag = `"${createHash("sha1").update(buf).digest("base64url")}"`;
  const headers = { ETag: etag, "Cache-Control": "private, no-cache" };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(buf), { headers: { ...headers, "Content-Type": "image/jpeg" } });
}

/** Normalizes teleproto's download result (Buffer, string path or undefined) to a non-empty Buffer or null. */
export function asPhotoBuffer(result: unknown): Buffer | null {
  return Buffer.isBuffer(result) && result.length > 0 ? result : null;
}
