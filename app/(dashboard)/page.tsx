"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";

interface Me {
  loggedIn: boolean;
  id?: string;
  chatId?: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
}

interface BotSummary {
  id: number;
  username: string;
  firstName: string;
  hasToken: boolean;
  maskedToken: string | null;
  monitorEnabled: boolean;
  details: { id: number; first_name: string } | null;
  webhook: { url: string } | null;
  error: string | null;
}

export default function OverviewPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [bots, setBots] = useState<BotSummary[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [meResult, botsResult] = await Promise.all([
        apiFetch<Me>("/api/me"),
        apiFetch<{ bots: BotSummary[] }>("/api/bots"),
      ]);
      setMe(meResult);
      setBots(botsResult.bots);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Your Telegram account</CardTitle>
        </CardHeader>
        {me?.loggedIn ? (
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Field label="Name" value={[me.firstName, me.lastName].filter(Boolean).join(" ") || "—"} />
            <Field label="Username" value={me.username ? `@${me.username}` : "—"} />
            <Field label="Chat ID" value={me.chatId ?? "—"} mono copy />
            <Field label="Phone" value={me.phone ? `+${me.phone}` : "—"} />
          </dl>
        ) : (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        )}
      </Card>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your bots</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              Refresh
            </Button>
            <Button size="sm" asChild>
              <Link href="/bots/new">New bot</Link>
            </Button>
          </div>
        </div>

        {loading && !bots && <p className="text-sm text-[var(--muted)]">Loading bots…</p>}
        {bots && bots.length === 0 && (
          <Card className="text-sm text-[var(--muted)]">
            No bots yet. Create one, or ask Telegram — bots you already own should show up automatically.
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bots?.map((bot) => (
            <Link key={bot.id} href={`/bots/${bot.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium">@{bot.username}</span>
                  {bot.monitorEnabled && (
                    <span className="rounded-full bg-[var(--success)]/15 px-2 py-0.5 text-xs font-medium text-[var(--success)]">
                      Monitoring
                    </span>
                  )}
                </div>
                <p className="mb-3 text-sm text-[var(--muted)]">{bot.firstName}</p>
                <div className="space-y-1 text-xs text-[var(--muted)]">
                  <div>Token: {bot.maskedToken ?? "not fetched"}</div>
                  <div>Webhook: {bot.webhook?.url ? "set" : "none"}</div>
                  {bot.error && <div className="text-[var(--danger)]">⚠ {bot.error}</div>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono, copy }: { label: string; value: string; mono?: boolean; copy?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className={`flex items-center gap-2 font-medium ${mono ? "font-mono" : ""}`}>
        {value}
        {copy && value !== "—" && (
          <button
            type="button"
            className="text-xs text-[var(--primary)] hover:underline"
            onClick={() => {
              navigator.clipboard.writeText(value);
              toast.success("Copied.");
            }}
          >
            copy
          </button>
        )}
      </dd>
    </div>
  );
}
