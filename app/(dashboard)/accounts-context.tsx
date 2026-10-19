"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ACCOUNTS_CHANGED_EVENT, apiFetch, clearMeCache, type TelegramAccountSummary } from "@/lib/api-client";

/** Also re-checks on focus/visibility; this catches a session ended from the phone while the tab sits open. */
const BACKGROUND_REFRESH_MS = 60_000;

interface AccountsContextValue {
  accounts: TelegramAccountSummary[] | null;
  active: TelegramAccountSummary | null;
  /** Bumps whenever the active account changes after the first load; the layout keys the page on it. */
  generation: number;
  reload: () => Promise<void>;
}

const AccountsContext = createContext<AccountsContextValue | null>(null);

export function accountLabel(account: TelegramAccountSummary): string {
  return account.username ? `@${account.username}` : account.firstName || account.telegramId;
}

/**
 * Single source of truth for the linked Telegram accounts across the
 * dashboard (sidebar switcher, accounts page), so linking, switching,
 * unbinding, or a session revoked on the phone shows up everywhere at once.
 */
export function AccountsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const [accounts, setAccounts] = useState<TelegramAccountSummary[] | null>(null);
  const [generation, setGeneration] = useState(0);
  const previousRef = useRef<TelegramAccountSummary[] | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const reload = useCallback(async () => {
    const seq = ++seqRef.current;
    let next: TelegramAccountSummary[];
    let activeChanged: boolean;
    try {
      const result = await apiFetch<{ accounts: TelegramAccountSummary[]; activeChanged?: boolean }>(
        "/api/telegram-accounts"
      );
      next = result.accounts;
      activeChanged = !!result.activeChanged;
    } catch {
      setAccounts((current) => current ?? []);
      return;
    }
    if (seq !== seqRef.current) return; // a newer reload is in flight

    const previous = previousRef.current;
    previousRef.current = next;
    setAccounts(next);

    for (const account of next) {
      const before = previous?.find((a) => a.id === account.id);
      if (before && !before.revoked && account.revoked) {
        toast.warning(`${accountLabel(account)} was signed out from another device. Scan a QR code to link it again.`, {
          duration: 10_000,
        });
      }
    }

    // On the first load there's nothing to compare against, but the page may
    // have already fetched as an account the server just moved the cookie off
    // (its session ended) — activeChanged covers that case.
    const previousActiveId = previous?.find((a) => a.isActive)?.id ?? null;
    const nextActiveId = next.find((a) => a.isActive)?.id ?? null;
    if (activeChanged || (previous && previousActiveId !== nextActiveId)) {
      clearMeCache();
      setGeneration((g) => g + 1);
      // Bot/chat detail pages belong to the old account and would 404 under the new one.
      const detail = /^\/(bots|chats)\/[^/]+/.exec(pathnameRef.current);
      if (detail && !pathnameRef.current.endsWith("/new")) router.push(`/${detail[1]}`);
    }
  }, [router]);

  useEffect(() => {
    // Intentional: fetch-on-mount into local state, not state synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();

    const refresh = () => void reload();
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    window.addEventListener(ACCOUNTS_CHANGED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshIfVisible);
    const timer = setInterval(refreshIfVisible, BACKGROUND_REFRESH_MS);
    return () => {
      window.removeEventListener(ACCOUNTS_CHANGED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      clearInterval(timer);
    };
  }, [reload]);

  const active = accounts?.find((a) => a.isActive) ?? null;
  return (
    <AccountsContext.Provider value={{ accounts, active, generation, reload }}>{children}</AccountsContext.Provider>
  );
}

export function useAccounts(): AccountsContextValue {
  const value = useContext(AccountsContext);
  if (!value) throw new Error("useAccounts must be used inside AccountsProvider.");
  return value;
}
