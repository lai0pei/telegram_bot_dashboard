import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      default: "bg-black/5 text-[var(--muted)] dark:bg-white/5",
      primary: "bg-[var(--primary)]/10 text-[var(--primary)]",
      success: "bg-[var(--success)]/15 text-[var(--success)]",
      danger: "bg-[var(--danger)]/15 text-[var(--danger)]",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}
