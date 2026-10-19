/** Thrown by apiFetch on a non-2xx response. Carries the full JSON body so callers can read extra fields. */
export class ApiError extends Error {
  constructor(message: string, public body: Record<string, unknown>) {
    super(message);
  }
}

/** Thin fetch wrapper for client components: JSON body, throws on non-2xx with the server's error message. */
export async function apiFetch<T = unknown>(
  url: string,
  options?: { method?: string; body?: unknown }
): Promise<T> {
  const res = await fetch(url, {
    method: options?.method ?? (options?.body ? "POST" : "GET"),
    headers: options?.body ? { "Content-Type": "application/json" } : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(json.error ?? `Request to ${url} failed with status ${res.status}`, json);
  }
  return json as T;
}
