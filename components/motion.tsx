"use client";

import { MotionConfig, motion, type Transition, type Variants } from "motion/react";

/** Shared spring used for layout/press animations across the app. */
export const spring: Transition = { type: "spring", stiffness: 400, damping: 30 };

/**
 * Fade-and-rise used for content entering the screen (cards, tab panels,
 * toasts-adjacent UI). Typed as plain targets (not `Variants`) so each key
 * can be passed directly to `initial`/`animate`/`exit` props; `satisfies
 * Variants` keeps it usable with the `variants` prop too (see StaggerItem).
 */
export const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
} satisfies Variants;

/** Plain fade, for things that shouldn't shift position (skeleton -> content swaps). */
export const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
} satisfies Variants;

/**
 * Wraps the app so all motion components respect the user's OS-level
 * reduced-motion preference automatically (transforms are skipped, opacity
 * fades still play).
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** Fades and rises a single element in on mount. */
export function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={fadeUp.initial}
      animate={fadeUp.animate}
      transition={{ ...spring, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Container for a grid of items that should enter one after another. */
export function Stagger({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial="initial"
      animate="animate"
      variants={{ animate: { transition: { staggerChildren: 0.04 } } }}
    >
      {children}
    </motion.div>
  );
}

/** One item inside a <Stagger>. */
export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={fadeUp} transition={spring}>
      {children}
    </motion.div>
  );
}
