"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { DashboardNav } from "./dashboard-nav";
import { AccountsProvider, useAccounts } from "./accounts-context";
import { ClientErrorListeners } from "./client-error-listeners";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AccountsProvider>
      <ClientErrorListeners />
      <DashboardShell>{children}</DashboardShell>
    </AccountsProvider>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { generation } = useAccounts();
  // A bot's page has its own section bar and wants the width, so its content cap is lifted (not /bots/new).
  const wide = /^\/bots\/\d+/.test(usePathname());

  /** Opens/closes after a short delay so a mouse just passing over the rail doesn't flash the panel. */
  function schedule(open: boolean, delay: number) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setExpanded(open), delay);
  }
  function setNow(open: boolean) {
    if (timer.current) clearTimeout(timer.current);
    setExpanded(open);
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  useEffect(() => {
    if (!expanded) return;
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setExpanded(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [expanded]);

  return (
    <div className="min-h-screen lg:flex">
      {/* The rail always takes 64px; the full panel slides out over the page on hover/focus/tap, so content never reflows. */}
      <aside className="relative hidden w-16 shrink-0 lg:block">
        <div className="sticky top-0 h-dvh">
          <div
            ref={panelRef}
            onMouseEnter={() => schedule(true, 120)}
            onMouseLeave={() => schedule(false, 200)}
            onFocus={() => setNow(true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setNow(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setNow(false);
            }}
            // The panel is always 256px wide and revealed by a clip-path (GPU-friendly, no layout work per frame), with the rail
            // icons and the full menu cross-fading inside it. The -2rem on the right keeps the shadow from being clipped.
            className={`absolute inset-y-0 left-0 z-30 w-64 border-r border-[var(--card-border)] bg-[var(--card)] transition-[clip-path,box-shadow] duration-200 ease-out motion-reduce:transition-none ${expanded ? "shadow-xl" : ""}`}
            style={{ clipPath: expanded ? "inset(0 -2rem 0 0)" : "inset(0 calc(100% - 4rem) 0 0)" }}
          >
            <div className={`absolute inset-y-0 left-0 w-16 p-2 transition-opacity duration-150 motion-reduce:transition-none ${expanded ? "pointer-events-none opacity-0" : "opacity-100"}`}>
              <DashboardNav collapsed onExpand={() => setNow(true)} />
            </div>
            {/* inert while collapsed: its links stay out of the tab order and the clipped area can't be hit. */}
            <div inert={!expanded} className={`absolute inset-y-0 left-0 w-64 p-4 transition-opacity duration-200 motion-reduce:transition-none ${expanded ? "opacity-100" : "opacity-0"}`}>
              <DashboardNav onNavigate={() => setNow(false)} />
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--card-border)] bg-[var(--card)]/80 px-4 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold">Bot Dashboard</span>
        </header>

        {mobileOpen && (
          <div className="fixed inset-0 z-30">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto bg-[var(--background)] p-4 shadow-xl">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
              <DashboardNav onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        {/* Remounts the page when the active Telegram account changes, so it re-fetches as the new account. */}
        <main key={generation} className={`mx-auto w-full flex-1 px-4 py-8 ${wide ? "max-w-[1920px]" : "max-w-[1440px]"}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
