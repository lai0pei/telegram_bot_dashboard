"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api-client";
import { parseTelegramIdText, validateTelegramIdList } from "@/lib/validation";
import type { AccessSettings } from "@/lib/app-settings";

function SourceBadge({ source }: { source: AccessSettings["registrationSource"] }) {
  return <Badge variant={source === "set" ? "primary" : "default"}>{source === "set" ? "Set here" : "From .env"}</Badge>;
}

/** Who may sign up and which Telegram accounts may link. A value saved here overrides the .env variable until it is reset. */
export function AccessTab() {
  const router = useRouter();
  const [settings, setSettings] = useState<AccessSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [restrict, setRestrict] = useState(false);
  const [idText, setIdText] = useState("");

  /** Shows what the server now has, and resets the allowlist form to it. */
  const adopt = useCallback((s: AccessSettings) => {
    setSettings(s);
    setRestrict(s.allowlist.restrict);
    setIdText(s.allowlist.ids.join("\n"));
  }, []);

  const fail = useCallback(
    (err: unknown, fallback: string) => {
      // Only a definite "you are not the admin" leaves the page.
      if (err instanceof ApiError && err.body.code === "NOT_ADMIN") router.replace("/");
      else toast.error(err instanceof Error ? err.message : fallback);
    },
    [router]
  );

  useEffect(() => {
    apiFetch<AccessSettings>("/api/admin/access")
      .then(adopt)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.body.code === "NOT_ADMIN") router.replace("/");
        else setError(err instanceof Error ? err.message : "Couldn't load the access settings.");
      });
  }, [adopt, router]);

  async function save(key: string, body: unknown, done: string) {
    setBusy(key);
    try {
      adopt(await apiFetch<AccessSettings>("/api/admin/access", { method: "PUT", body }));
      toast.success(done);
    } catch (err) {
      fail(err, "Couldn't save that.");
    } finally {
      setBusy(null);
    }
  }

  if (error) return <p className="text-sm text-[var(--danger)]">{error}</p>;
  if (!settings) return <Skeleton className="h-64 w-full" />;

  const ids = parseTelegramIdText(idText);
  const invalid = validateTelegramIdList(ids);
  const dirty = restrict !== settings.allowlist.restrict || ids.join(",") !== settings.allowlist.ids.join(",");

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>New sign-ups</CardTitle>
          <SourceBadge source={settings.registrationSource} />
        </CardHeader>
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm text-[var(--muted)]">
            When on, a Telegram account the dashboard has never seen can sign in and gets its own dashboard account. When
            off, only accounts that already have one can sign in. The master admin can always sign in.
          </p>
          <Switch
            checked={settings.registrationOpen}
            disabled={busy !== null}
            aria-label="Allow new sign-ups"
            onCheckedChange={(open) => void save("registration", { registrationOpen: open }, open ? "Sign-ups are open." : "Sign-ups are closed.")}
          />
        </div>
        {settings.registrationSource === "set" && (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--card-border)] pt-3 text-sm">
            <span className="text-[var(--muted)]">.env would give: {settings.env.registrationOpen ? "open" : "closed"}</span>
            <Button
              size="sm"
              variant="outline"
              loading={busy === "registration-reset"}
              disabled={busy !== null}
              onClick={() => void save("registration-reset", { registrationOpen: null }, "Back to the .env value.")}
            >
              Reset to .env
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Who can sign in or link an account</CardTitle>
          <SourceBadge source={settings.allowlistSource} />
        </CardHeader>
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm text-[var(--muted)]">
            Restrict sign-in and linking to the Telegram user IDs below. While this is on, any account not on the list{" "}
            <strong>cannot sign in or be linked</strong>, including people who already have a dashboard account. The master
            admin always can. With it off, anyone can.
          </p>
          <Switch checked={restrict} disabled={busy !== null} onCheckedChange={setRestrict} aria-label="Restrict to the listed IDs" />
        </div>
        <label className="mt-4 block text-sm font-medium" htmlFor="allowlist-ids">
          Allowed Telegram user IDs
        </label>
        <Textarea
          rows={6}
          className="mt-1 font-mono"
          id="allowlist-ids"
          value={idText}
          onChange={(e) => setIdText(e.target.value)}
          placeholder={"One per line, e.g.\n123456789"}
          spellCheck={false}
        />
        <p className="mt-1 text-xs text-[var(--muted)]">
          {invalid ?? `${ids.length} ID${ids.length === 1 ? "" : "s"}. A rejected account's ID is shown on its sign-in screen, so people can send it to you.`}
        </p>
        {restrict && ids.length === 0 && (
          <p className="mt-2 text-sm text-[var(--danger)]">With restriction on and no IDs, only the master admin can sign in.</p>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Button
            loading={busy === "allowlist"}
            disabled={busy !== null || !dirty || invalid !== null}
            onClick={() => void save("allowlist", { allowlist: { restrict, ids } }, "Allowlist saved.")}
          >
            Save
          </Button>
          {settings.allowlistSource === "set" && (
            <Button
              size="sm"
              variant="outline"
              loading={busy === "allowlist-reset"}
              disabled={busy !== null}
              onClick={() => void save("allowlist-reset", { allowlist: null }, "Back to the .env value.")}
            >
              Reset to .env ({settings.env.allowlist.restrict ? `${settings.env.allowlist.ids.length} IDs` : "no restriction"})
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
