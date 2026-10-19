"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { motion } from "motion/react";
import { createContext, forwardRef, useContext, useId, useState } from "react";
import { cn } from "@/lib/utils";
import { fadeUp, spring } from "@/components/motion";

/** Tracks which tab is active so TabsTrigger can share one sliding highlight via layoutId. */
const ActiveTabContext = createContext<{ value: string | undefined; layoutId: string } | null>(null);

const Tabs = forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ defaultValue, value, onValueChange, ...props }, ref) => {
  const layoutId = useId();
  const [internalValue, setInternalValue] = useState(value ?? defaultValue);
  const active = value ?? internalValue;

  return (
    <ActiveTabContext.Provider value={{ value: active, layoutId }}>
      <TabsPrimitive.Root
        ref={ref}
        defaultValue={defaultValue}
        value={value}
        onValueChange={(v) => {
          setInternalValue(v);
          onValueChange?.(v);
        }}
        {...props}
      />
    </ActiveTabContext.Provider>
  );
});
Tabs.displayName = "Tabs";

const TabsList = forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "no-scrollbar inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-black/5 p-1 dark:bg-white/5",
      className
    )}
    {...props}
  />
));
TabsList.displayName = "TabsList";

const TabsTrigger = forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, value, children, ...props }, ref) => {
  const ctx = useContext(ActiveTabContext);
  const isActive = ctx?.value === value;

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      value={value}
      className={cn(
        "relative shrink-0 rounded-md px-3 py-1.5 text-sm font-medium text-[var(--muted)] transition-colors data-[state=active]:text-[var(--foreground)]",
        className
      )}
      {...props}
    >
      {isActive && ctx && (
        <motion.span
          layoutId={ctx.layoutId}
          className="absolute inset-0 rounded-md bg-[var(--card)] shadow-sm"
          transition={spring}
        />
      )}
      <span className="relative z-10">{children}</span>
    </TabsPrimitive.Trigger>
  );
});
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn("mt-4 outline-none", className)} {...props}>
    {/* Radix mounts only the active content, so this plays its enter animation on every switch. */}
    <motion.div
      initial={fadeUp.initial}
      animate={fadeUp.animate}
      transition={{ ...spring, duration: 0.2 }}
    >
      {children}
    </motion.div>
  </TabsPrimitive.Content>
));
TabsContent.displayName = "TabsContent";

export { Tabs, TabsList, TabsTrigger, TabsContent };
