"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, LayoutGrid, Megaphone, Settings, ShieldCheck, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";
import { AccountSwitcher } from "./account-switcher";
import { accountLabel, useAccounts } from "./accounts-context";
import { LogoutButton } from "./logout-button";

const NAV_LINKS = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/bots", label: "Bots", icon: Bot },
  { href: "/chats", label: "Channels & groups", icon: Megaphone },
  { href: "/telegram-accounts", label: "Telegram accounts", icon: Smartphone },
  { href: "/settings", label: "Settings", icon: Settings },
];
const ADMIN_LINK = { href: "/admin", label: "Admin", icon: ShieldCheck };

/**
 * Sidebar content shared between the desktop sidebar and the mobile menu
 * sheet. Keeps "which Telegram account you're acting as" (top) visually
 * separate from "which dashboard user you are" (bottom) — the two are easy
 * to confuse once an account switcher exists.
 */
export function DashboardNav({ onNavigate, collapsed = false, onExpand }: { onNavigate?: () => void; /** The icon-only rail (desktop); `onExpand` opens the full panel. */ collapsed?: boolean; onExpand?: () => void }) {
  const pathname = usePathname();
  const [username, setUsername] = useState<string | null>(null);
  const { active, isAdmin } = useAccounts();
  // One list feeds the rail, the full panel and the mobile sheet, so the Admin link can't show in only some of them.
  const links = isAdmin ? [...NAV_LINKS, ADMIN_LINK] : NAV_LINKS;

  useEffect(() => {
    void apiFetch<{ username: string }>("/api/account")
      .then((r) => setUsername(r.username))
      .catch(() => {});
  }, []);

  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center gap-4">
        <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                title={label}
                aria-label={label}
                className={cn("flex h-10 w-10 items-center justify-center rounded-lg transition-colors", active ? "bg-[var(--primary)]/10 text-[var(--primary)]" : "text-[var(--muted)] hover:bg-black/5 hover:text-[var(--foreground)] dark:hover:bg-white/5")}
              >
                <Icon className="h-5 w-5" />
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-col items-center gap-2 border-t border-[var(--card-border)] pt-3">
          <button type="button" onClick={onExpand} title={active ? `Acting as ${accountLabel(active)} — switch account` : "No Telegram account"} aria-label="Switch Telegram account" className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary)]/10 text-xs font-semibold text-[var(--primary)]">
            {active ? accountLabel(active).replace(/^@/, "").slice(0, 1).toUpperCase() : "?"}
          </button>
          <LogoutButton compact />
        </div>
      </div>
    );
  }

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
        {links.map(({ href, label, icon: Icon }) => {
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
