"use client";

import { useEffect } from "react";
import { ApiError } from "@/lib/api-client";
import { reportClientError } from "@/lib/report-client-error";

/** Reports errors no component caught (an uncaught exception, a promise rejected with nobody listening). Renders nothing. */
export function ClientErrorListeners() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      // Browsers raise this for harmless layout feedback loops; it is not an app bug.
      if (/ResizeObserver loop/i.test(e.message)) return;
      reportClientError("window error", e.error ?? e.message);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      // A failed API call (4xx/5xx) surfaces to the person as a toast; the server already logged real 5xx errors.
      if (e.reason instanceof ApiError) return;
      reportClientError("unhandled rejection", e.reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
