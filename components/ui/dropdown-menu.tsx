"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface DropdownItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** A small count or mark shown at the end of the row. */
  badge?: string;
}

/**
 * A button that opens a list of choices. Built in-house to avoid another dependency: closes on outside click, Escape or a
 * pick (Escape returns focus to the button), ArrowUp / ArrowDown / Home / End move between rows. It positions itself
 * absolutely, so no ancestor may set `overflow` or the list would be clipped.
 */
export function DropdownMenu({
  children,
  items,
  value,
  onSelect,
  active = false,
  className,
}: {
  /** The button's content (the chevron is added). */
  children: React.ReactNode;
  items: DropdownItem[];
  /** The row that is currently chosen (marked and focused first). */
  value?: string;
  onSelect: (id: string) => void;
  /** Highlights the button, e.g. when the chosen row is inside this menu. */
  active?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const rows = list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    (list.current?.querySelector<HTMLElement>('[aria-current="true"]') ?? rows?.[0])?.focus();
    function onDown(e: MouseEvent) {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      trigger.current?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const rows = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (!rows.length) return;
    e.preventDefault();
    const at = rows.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? rows.length - 1 : e.key === "ArrowDown" ? (at + 1) % rows.length : (at - 1 + rows.length) % rows.length;
    rows[next].focus();
  }

  return (
    <div ref={root} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
          active ? "bg-[var(--primary)]/10 font-medium text-[var(--primary)]" : "text-[var(--muted)] hover:bg-black/5 hover:text-[var(--foreground)] dark:hover:bg-white/5",
          className
        )}
      >
        {children}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div ref={list} role="menu" className="card absolute left-0 top-full z-40 mt-1 min-w-52 space-y-0.5 p-1 shadow-lg">
          {items.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              aria-current={value === id ? "true" : undefined}
              onClick={() => {
                setOpen(false);
                onSelect(id);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
                value === id ? "bg-[var(--primary)]/10 font-medium text-[var(--primary)]" : "hover:bg-black/5 dark:hover:bg-white/5"
              )}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />}
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {badge && <span className="rounded-full bg-black/5 px-1.5 text-[11px] tabular-nums dark:bg-white/10">{badge}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
