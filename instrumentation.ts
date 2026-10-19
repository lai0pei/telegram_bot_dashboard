/**
 * Next.js instrumentation hook — runs once when the server process starts.
 * Used here to kick off the background getUpdates poller for monitored bots.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startPoller } = await import("./lib/poller");
    startPoller();
  }
}
