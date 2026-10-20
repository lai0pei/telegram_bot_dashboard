import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";

/** Shared header for bot/chat detail pages: a back link to their list page, an initial avatar, and title/subtitle. */
export function DetailHeader({
  title,
  subtitle,
  backHref,
  backLabel,
  photoSrc,
}: {
  title: string;
  subtitle: string;
  backHref: string;
  backLabel: string;
  /** Optional profile photo URL; falls back to the title's initial. */
  photoSrc?: string;
}) {
  return (
    <div className="space-y-3">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {backLabel}
      </Link>
      <div className="flex items-center gap-3">
        <Avatar src={photoSrc} name={title} className="h-10 w-10" />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{title}</h1>
          <p className="truncate text-sm text-[var(--muted)]">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
