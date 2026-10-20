"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { DashboardNav } from "./dashboard-nav";
import { AccountsProvider, useAccounts } from "./accounts-context";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AccountsProvider>
      <DashboardShell>{children}</DashboardShell>
    </AccountsProvider>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { generation } = useAccounts();

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 border-r border-[var(--card-border)] bg-[var(--card)]/60 p-4 lg:block">
        <DashboardNav />
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
          <div className="fixed inset-0 z-30 lg:hidden">
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
        <main key={generation} className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
