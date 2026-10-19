import { NextResponse } from "next/server";
import { isAuthenticated } from "./auth";

/** Wraps a route handler so it 401s unless the dashboard-password cookie is valid. */
export function withAuth<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    if (!(await isAuthenticated())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handler(...args);
  };
}

export function errorResponse(err: unknown, fallbackStatus = 500): Response {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  return NextResponse.json({ error: message }, { status: fallbackStatus });
}
