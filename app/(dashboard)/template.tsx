"use client";

import { motion } from "motion/react";
import { fadeUp, spring } from "@/components/motion";

/**
 * A template (unlike a layout) remounts on every navigation, so this plays
 * an enter animation on each page change. The App Router unmounts the old
 * page immediately, so there's no matching exit animation here.
 */
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={fadeUp.initial} animate={fadeUp.animate} transition={spring}>
      {children}
    </motion.div>
  );
}
