/**
 * Minimal in-memory fixed-window rate limiter, keyed by caller-supplied key
 * (typically an IP address). Good enough for a single-process deployment;
 * resets on restart, and doesn't share state across multiple instances.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

declare global {
  var __tgDashRateLimits: { buckets: Map<string, Bucket>; lastSweep: number } | undefined;
}

const SWEEP_INTERVAL_MS = 60_000;

function store() {
  return (globalThis.__tgDashRateLimits ??= { buckets: new Map(), lastSweep: Date.now() });
}

/** Drops expired buckets so a flood of distinct keys (e.g. many IPs) can't grow the map forever. */
function sweep(now: number) {
  const s = store();
  if (now - s.lastSweep < SWEEP_INTERVAL_MS) return;
  s.lastSweep = now;
  for (const [key, bucket] of s.buckets) {
    if (bucket.resetAt < now) s.buckets.delete(key);
  }
}

/** Counts one hit; returns true if the request should be allowed, false if the key is over its limit for this window. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now);
  const { buckets } = store();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

/**
 * Client IP from X-Forwarded-For, read from the right: each proxy appends
 * the address it received the request from, so only the entries added by
 * our own proxies can be trusted — anything to their left is whatever the
 * client chose to send. TRUSTED_PROXY_HOPS is how many proxies sit in front
 * of the app (default 1, e.g. nginx/Caddy). With no proxy, Next.js fills the
 * header from the socket only when the client didn't send one, so per-IP
 * limits are spoofable there.
 */
export function getClientIp(req: Request): string {
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS) || 1);
  const entries = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return entries[Math.max(0, entries.length - hops)] ?? "unknown";
}
