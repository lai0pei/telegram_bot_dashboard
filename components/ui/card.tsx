"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { spring } from "@/components/motion";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card p-5", className)} {...props} />;
}

/** A Card that lifts on hover and settles on press. Use for clickable cards (grid items that link elsewhere). */
export function InteractiveCard({ className, ...props }: React.ComponentProps<typeof motion.div>) {
  return (
    <motion.div
      className={cn("card cursor-pointer p-5 shadow-sm", className)}
      whileHover={{ y: -2, boxShadow: "0 8px 20px -6px rgb(0 0 0 / 0.12)" }}
      whileTap={{ scale: 0.98 }}
      transition={spring}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 flex items-center justify-between", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold", className)} {...props} />;
}
