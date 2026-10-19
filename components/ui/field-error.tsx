"use client";

import { AnimatePresence, motion } from "motion/react";

/** Fades and expands a validation error into view, instead of popping in. Renders nothing when there's no error. */
export function FieldError({ error }: { error?: string | null }) {
  return (
    <AnimatePresence initial={false}>
      {error && (
        <motion.p
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.15 }}
          className="overflow-hidden text-xs text-[var(--danger)]"
        >
          {error}
        </motion.p>
      )}
    </AnimatePresence>
  );
}
