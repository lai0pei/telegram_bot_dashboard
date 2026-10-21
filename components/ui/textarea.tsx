import { forwardRef } from "react";
import { cn } from "@/lib/utils";

// Long-text fields (replies, broadcasts, descriptions): tall by default, resizable, and growing with the content where field-sizing is supported.
const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 8, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        "min-h-40 max-h-[60vh] w-full resize-y rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm outline-none transition-colors [field-sizing:content] placeholder:text-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:opacity-60",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export { Textarea };
