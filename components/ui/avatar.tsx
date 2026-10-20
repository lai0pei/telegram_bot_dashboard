"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Round avatar: the image at `src` (an authenticated photo route), or the first letter of `name`
 * when there is no photo or it fails to load. Changing `src` retries the image.
 */
export function Avatar({
  src,
  name,
  className,
  textClassName = "text-sm",
}: {
  src?: string | null;
  name: string;
  className?: string;
  textClassName?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const initial = name.replace(/^@/, "").charAt(0).toUpperCase() || "?";
  const showImage = Boolean(src) && failedSrc !== src;

  return showImage ? (
    // eslint-disable-next-line @next/next/no-img-element -- authenticated image from our own API, not optimizable by next/image
    <img
      src={src!}
      alt=""
      loading="lazy"
      className={cn("shrink-0 rounded-full object-cover", className)}
      onError={() => setFailedSrc(src!)}
    />
  ) : (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10 font-semibold text-[var(--primary)]",
        textClassName,
        className
      )}
    >
      {initial}
    </div>
  );
}
