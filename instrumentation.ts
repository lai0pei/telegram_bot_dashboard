import type { Instrumentation } from "next";

/**
 * Next.js instrumentation hook — runs once when the server process starts.
 * Used here to kick off the background getUpdates poller for monitored bots and the job loop (scheduled messages, broadcasts, health checks).
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startPoller } = await import("./lib/poller");
    startPoller();
    const { startJobs } = await import("./lib/jobs");
    startJobs();
  }
}

/**
 * Called by Next for server errors nothing else caught (a route handler that
 * threw outside its try/catch, a failing server render, the proxy). Errors a
 * route handles itself go through errorResponse instead. Only the path is
 * kept: the query string can carry things that don't belong in a log.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logError } = await import("./lib/error-log");
  logError("request", `${request.method} ${context.routePath} (${context.routeType})`, err, {
    path: request.path.split("?")[0],
  });
};
