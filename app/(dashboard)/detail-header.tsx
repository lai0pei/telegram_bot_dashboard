import { ArrowLeft } from "lucide-react";
import Link from "next/link";

/** Shared header for bot/chat detail pages: a back link, an initial avatar, and title/subtitle. */
export function DetailHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const initial = title.replace(/^@/, "").charAt(0).toUpperCase() || "?";
  return (
    <div className="space-y-3">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </Link>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10 text-sm font-semibold text-[var(--primary)]">
          {initial}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{title}</h1>
          <p className="truncate text-sm text-[var(--muted)]">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
