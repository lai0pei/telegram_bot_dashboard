"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, clearMeCache, type TelegramAccountSummary } from "@/lib/api-client";
import { cn } from "@/lib/utils";

function accountLabel(account: TelegramAccountSummary): string {
  return account.username ? `@${account.username}` : account.firstName || account.telegramId;
}

export function AccountSwitcher() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<TelegramAccountSummary[] | null>(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const result = await apiFetch<{ accounts: TelegramAccountSummary[] }>("/api/telegram-accounts");
      setAccounts(result.accounts);
    } catch {
      setAccounts([]);
    }
  }

  useEffect(() => {
    // Intentional: fetch-on-mount into local state, not state synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function activate(id: string) {
    if (switching) return;
    setSwitching(true);
    try {
      await apiFetch(`/api/telegram-accounts/${id}/activate`, { method: "POST" });
      clearMeCache();
      setOpen(false);
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to switch accounts.");
    } finally {
      setSwitching(false);
    }
  }

  const active = accounts?.find((a) => a.isActive) ?? null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-left text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10 text-xs font-semibold text-[var(--primary)]">
          {active ? accountLabel(active).replace(/^@/, "").slice(0, 1).toUpperCase() : "?"}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">
          {accounts === null ? "Loading…" : active ? accountLabel(active) : "No Telegram account"}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-full min-w-56 rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-1 shadow-lg">
          {accounts?.map((account) => (
            <button
              key={account.id}
              type="button"
              onClick={() => activate(account.id)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            >
              <span className={cn("h-3.5 w-3.5 shrink-0", !account.isActive && "opacity-0")}>
                <Check className="h-3.5 w-3.5 text-[var(--primary)]" />
              </span>
              <span className="min-w-0 flex-1 truncate">{accountLabel(account)}</span>
            </button>
          ))}
          {accounts && accounts.length > 0 && <div className="my-1 h-px bg-[var(--card-border)]" />}
          <Link
            href="/telegram-accounts/new"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--primary)] transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          >
            <Plus className="h-3.5 w-3.5" />
            Link Telegram account
          </Link>
        </div>
      )}
    </div>
  );
}
