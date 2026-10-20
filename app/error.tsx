"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-client-error";

/** A page crashed while rendering: report it, and offer a retry instead of a blank screen. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    reportClientError("render error", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md space-y-3 py-16 text-center">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-sm text-[var(--muted)]">
        This page hit an unexpected error. It has been reported to the dashboard admin.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="inline-flex h-10 items-center rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
