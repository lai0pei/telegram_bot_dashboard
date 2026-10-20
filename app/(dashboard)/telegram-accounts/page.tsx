"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, QrCode, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { apiFetch, type TelegramAccountSummary } from "@/lib/api-client";
import { FadeIn } from "@/components/motion";
import { accountLabel, useAccounts } from "../accounts-context";

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function DigestSettings({ account }: { account: TelegramAccountSummary }) {
  const { reload } = useAccounts();
  const [frequency, setFrequency] = useState(account.digestFrequency);
  const [hour, setHour] = useState(account.digestHour);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  async function save(next: { digestFrequency: typeof frequency; digestHour: number }) {
    setSaving(true);
    try {
      await apiFetch(`/api/telegram-accounts/${account.id}`, { method: "PATCH", body: next });
      await reload();
      toast.success("Digest schedule updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update digest schedule.");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setSending(true);
    try {
      await apiFetch(`/api/telegram-accounts/${account.id}/digest`, { method: "POST" });
      toast.success("Digest sent to Saved Messages.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send digest.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-4 border-t border-[var(--card-border)] pt-4">
      <Label className="mb-2 block text-xs text-[var(--muted)]">Saved Messages digest</Label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={frequency}
          disabled={saving || account.revoked}
          onChange={(e) => {
            const value = e.target.value as typeof frequency;
            setFrequency(value);
            save({ digestFrequency: value, digestHour: hour });
          }}
          className="h-9 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
        >
          <option value="off">Off</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
        {frequency !== "off" && (
          <select
            value={hour}
            disabled={saving || account.revoked}
            onChange={(e) => {
              const value = Number(e.target.value);
              setHour(value);
              save({ digestFrequency: frequency, digestHour: value });
            }}
            className="h-9 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00 UTC
              </option>
            ))}
          </select>
        )}
        <Button variant="outline" size="sm" loading={sending} disabled={account.revoked} onClick={sendTest}>
          <Send className="h-3.5 w-3.5" />
          Send test
        </Button>
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]">
        A summary of what needs attention, sent to this account&apos;s own Saved Messages.
      </p>
    </div>
  );
}

export default function TelegramAccountsPage() {
  const { accounts, reload } = useAccounts();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function activate(id: string) {
    setBusyId(id);
    try {
      await apiFetch(`/api/telegram-accounts/${id}/activate`, { method: "POST" });
      await reload();
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
      setConfirmId(null);
      await reload();
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
                    {account.revoked && <Badge variant="danger">Session ended</Badge>}
                  </CardTitle>
                </CardHeader>
                {account.revoked && (
                  <p className="mb-4 text-sm text-[var(--muted)]">
                    This account was signed out from another device (for example from Telegram&apos;s Devices list).
                    Its bots and channels are kept here — scan a QR code with it to pick up where you left off.
                  </p>
                )}
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

                {!account.revoked && <DigestSettings account={account} />}

                {confirmId === account.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-[var(--danger)]">
                      Unbind this account? Its bots, channels/groups, and message history on this dashboard will be
                      deleted (the Telegram account itself is unaffected, except it will be logged out of this
                      dashboard).
                      {account.tokenBots.length > 0 && (
                        <>
                          {" "}
                          This also removes {account.tokenBots.length} bot{account.tokenBots.length === 1 ? "" : "s"} you added by token (
                          {account.tokenBots.map((u) => `@${u}`).join(", ")}). Those bots keep working on Telegram.
                        </>
                      )}
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
                    {account.revoked && (
                      <Button size="sm" asChild>
                        <Link href="/telegram-accounts/new">
                          <QrCode className="h-3.5 w-3.5" />
                          Link again
                        </Link>
                      </Button>
                    )}
                    {!account.isActive && !account.revoked && (
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
