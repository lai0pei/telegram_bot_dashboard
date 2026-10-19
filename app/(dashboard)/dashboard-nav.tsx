"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, LayoutGrid, Settings, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";
import { AccountSwitcher } from "./account-switcher";
import { LogoutButton } from "./logout-button";

const NAV_LINKS = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/telegram-accounts", label: "Telegram accounts", icon: Smartphone },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * Sidebar content shared between the desktop sidebar and the mobile menu
 * sheet. Keeps "which Telegram account you're acting as" (top) visually
 * separate from "which dashboard user you are" (bottom) — the two are easy
 * to confuse once an account switcher exists.
 */
export function DashboardNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<{ username: string }>("/api/account")
      .then((r) => setUsername(r.username))
      .catch(() => {});
  }, []);

  return (
    <div className="flex h-full flex-col gap-6">
      <div>
        <Link href="/" className="mb-4 flex items-center gap-2 font-semibold">
          <Bot className="h-5 w-5 text-[var(--primary)]" />
          Bot Dashboard
        </Link>
        <AccountSwitcher />
      </div>

      <nav className="flex-1 space-y-1">
        {NAV_LINKS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                  : "text-[var(--muted)] hover:bg-black/5 hover:text-[var(--foreground)] dark:hover:bg-white/5"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center justify-between gap-2 border-t border-[var(--card-border)] pt-4">
        <span className="min-w-0 truncate text-sm text-[var(--muted)]">{username ?? ""}</span>
        <LogoutButton />
      </div>
    </div>
  );
}
