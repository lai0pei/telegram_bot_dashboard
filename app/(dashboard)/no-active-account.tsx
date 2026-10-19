"use client";

import Link from "next/link";
import { Bot as BotIcon, Plus, QrCode, Unplug } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/motion";
import { AccountCardSkeleton } from "./loading";
import { accountLabel, useAccounts } from "./accounts-context";

/** SESSION_REVOKED is included: the AccountsProvider is already re-syncing onto another live account, if any. */
export function isNoActiveAccount(err: unknown): boolean {
  return err instanceof ApiError && (err.body.code === "NO_ACTIVE_ACCOUNT" || err.body.code === "SESSION_REVOKED");
}

/**
 * Shown by any account-scoped page when no Telegram account is active. If the
 * reason is that sessions ended on the phone (and no live account is left to
 * switch to), say so and offer to re-link, rather than the first-time prompt.
 */
export function NoActiveAccount() {
  const { accounts } = useAccounts();
  if (accounts === null) return <AccountCardSkeleton />;

  const revoked = accounts.filter((a) => a.revoked);
  const hasLive = accounts.some((a) => !a.revoked);

  if (revoked.length > 0 && !hasLive) {
    return (
      <FadeIn>
        <Card className="flex flex-col items-center gap-3 py-10 text-center text-sm text-[var(--muted)]">
          <Unplug className="h-8 w-8 text-[var(--danger)]" />
          <p className="font-medium text-[var(--foreground)]">
            {revoked.length === 1
              ? `${accountLabel(revoked[0])} was signed out from another device`
              : "Your Telegram accounts were signed out from another device"}
          </p>
          <p className="max-w-sm">
            This usually means the dashboard&apos;s session was ended from Telegram&apos;s Devices list. Its bots and
            channels are still here — scan a QR code with the same account to pick up where you left off.
          </p>
          <Button size="sm" asChild>
            <Link href="/telegram-accounts/new">
              <QrCode className="h-3.5 w-3.5" />
              Link again
            </Link>
          </Button>
        </Card>
      </FadeIn>
    );
  }

  return (
    <FadeIn>
      <Card className="flex flex-col items-center gap-3 py-10 text-center text-sm text-[var(--muted)]">
        <BotIcon className="h-8 w-8 text-[var(--muted)]" />
        <p>
          {hasLive
            ? "Pick a Telegram account from the switcher in the sidebar to see its bots and channels."
            : "Link a Telegram account to start managing its bots and channels."}
        </p>
        <Button size="sm" asChild>
          <Link href="/telegram-accounts/new">
            <Plus className="h-3.5 w-3.5" />
            Link Telegram account
          </Link>
        </Button>
      </Card>
    </FadeIn>
  );
}
