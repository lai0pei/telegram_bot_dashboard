"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-client-error";

/**
 * Last resort: the root layout itself crashed. This replaces the whole document, so it brings its own html/body and
 * plain styles (global CSS isn't loaded here).
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    reportClientError("global render error", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "4rem 1rem" }}>
        <h2>Something went wrong</h2>
        <p>The dashboard hit an unexpected error and it has been reported.</p>
        <button type="button" onClick={() => retry()} style={{ padding: "0.5rem 1rem", cursor: "pointer" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
