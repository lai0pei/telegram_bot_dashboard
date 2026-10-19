import { Bot } from "lucide-react";
import Link from "next/link";
import { LogoutButton } from "./logout-button";
import { AccountBadge } from "./account-badge";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-[var(--card-border)] bg-[var(--card)]/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Bot className="h-5 w-5 text-[var(--primary)]" />
            Bot Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <AccountBadge />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
