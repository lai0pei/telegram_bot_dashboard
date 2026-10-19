"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch, clearMeCache, type TelegramAccountSummary } from "@/lib/api-client";
import { FadeIn } from "@/components/motion";

function accountLabel(account: TelegramAccountSummary): string {
  return account.username ? `@${account.username}` : account.firstName || account.telegramId;
}

export default function TelegramAccountsPage() {
  const [accounts, setAccounts] = useState<TelegramAccountSummary[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function load() {
    try {
      const result = await apiFetch<{ accounts: TelegramAccountSummary[] }>("/api/telegram-accounts");
      setAccounts(result.accounts);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load Telegram accounts.");
    }
  }

  useEffect(() => {
    // Intentional: fetch-on-mount into local state, not state synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function activate(id: string) {
    setBusyId(id);
    try {
      await apiFetch(`/api/telegram-accounts/${id}/activate`, { method: "POST" });
      clearMeCache();
      await load();
      toast.success("Switched active account.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to switch accounts.");
    } finally {
      setBusyId(null);
    }
  }

  async function unbind(id: string) {
    setBusyId(id);
    try {
      await apiFetch(`/api/telegram-accounts/${id}`, { method: "DELETE" });
      clearMeCache();
      setConfirmId(null);
      await load();
      toast.success("Telegram account unbound.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unbind account.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Telegram accounts</h1>
        <Button size="sm" asChild>
          <Link href="/telegram-accounts/new">
            <Plus className="h-3.5 w-3.5" />
            Link account
          </Link>
        </Button>
      </div>

      {accounts === null ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : accounts.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center text-sm text-[var(--muted)]">
          <p>No Telegram accounts linked yet.</p>
          <Button size="sm" asChild>
            <Link href="/telegram-accounts/new">
              <Plus className="h-3.5 w-3.5" />
              Link account
            </Link>
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <FadeIn key={account.id}>
              <Card>
                <CardHeader className="mb-2">
                  <CardTitle className="flex items-center gap-2">
                    {accountLabel(account)}
                    {account.isActive && <Badge variant="primary">Active</Badge>}
                  </CardTitle>
                </CardHeader>
                <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-[var(--muted)]">Name</dt>
                    <dd>{[account.firstName, account.lastName].filter(Boolean).join(" ") || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--muted)]">Chat ID</dt>
                    <dd className="font-mono">{account.telegramId}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--muted)]">Phone</dt>
                    <dd>{account.phone ? `+${account.phone}` : "—"}</dd>
                  </div>
                </dl>

                {confirmId === account.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-[var(--danger)]">
                      Unbind this account? Its bots, channels/groups, and message history on this dashboard will be
                      deleted (the Telegram account itself is unaffected, except it will be logged out of this
                      dashboard).
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setConfirmId(null)}>
                        Cancel
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        loading={busyId === account.id}
                        onClick={() => unbind(account.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Unbind
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    {!account.isActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        loading={busyId === account.id}
                        onClick={() => activate(account.id)}
                      >
                        Make active
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setConfirmId(account.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                      Unbind
                    </Button>
                  </div>
                )}
              </Card>
            </FadeIn>
          ))}
        </div>
      )}
    </div>
  );
}
