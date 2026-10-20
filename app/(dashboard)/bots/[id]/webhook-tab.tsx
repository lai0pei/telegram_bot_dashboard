"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link2, Link2Off, Shuffle } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import {
  ALLOWED_UPDATE_TYPES,
  validateMaxConnections,
  validateWebhookSecret,
  validateWebhookUrl,
} from "@/lib/validation";
import { FieldError } from "@/components/ui/field-error";
import type { BotDetail } from "./types";

/** 32 random bytes as base64url: within Telegram's 1-256 char [A-Za-z0-9_-] secret token rules. */
function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function WebhookTab({ bot, onChange }: { bot: BotDetail; onChange: () => void }) {
  const [url, setUrl] = useState(bot.webhook?.url ?? "");
  const [secret, setSecret] = useState("");
  const [maxConnections, setMaxConnections] = useState(String(bot.webhook?.max_connections ?? 40));
  const [allowed, setAllowed] = useState<string[]>(bot.webhook?.allowed_updates ?? []);
  const [dropPending, setDropPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const urlError = url ? validateWebhookUrl(url) : null;
  const secretError = validateWebhookSecret(secret);
  const maxError = validateMaxConnections(Number(maxConnections));
  const invalid = !url || Boolean(urlError || secretError || maxError);

  function toggleUpdate(type: string, checked: boolean) {
    setAllowed((prev) => (checked ? [...prev, type] : prev.filter((t) => t !== type)));
  }

  async function handleSet(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (invalid) return;
    setSaving(true);
    try {
      await apiFetch(`/api/bots/${bot.id}/webhook`, {
        method: "PUT",
        body: {
          url,
          secretToken: secret || undefined,
          allowedUpdates: allowed,
          maxConnections: Number(maxConnections),
          dropPendingUpdates: dropPending,
        },
      });
      toast.success("Webhook updated.");
      setSecret("");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set webhook.");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    try {
      await apiFetch(`/api/bots/${bot.id}/webhook`, { method: "PUT", body: { url: null, dropPendingUpdates: dropPending } });
      setUrl("");
      toast.success("Webhook removed.");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove webhook.");
    } finally {
      setSaving(false);
    }
  }

  const info = bot.webhook;

  return (
    <Card>
      <form onSubmit={handleSet} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="webhookUrl">Webhook URL</Label>
          <Input
            id="webhookUrl"
            placeholder="https://example.com/webhook/your-bot"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => setTouched(true)}
          />
          {touched && <FieldError error={urlError} />}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="webhookSecret">Secret token (optional)</Label>
          <div className="flex gap-2">
            <Input
              id="webhookSecret"
              className="font-mono"
              maxLength={256}
              placeholder="Sent back in the X-Telegram-Bot-Api-Secret-Token header"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
            <Button type="button" variant="outline" onClick={() => setSecret(generateSecret())}>
              <Shuffle className="h-3.5 w-3.5" />
              Generate
            </Button>
          </div>
          <FieldError error={secretError} />
          <p className="text-xs text-[var(--muted)]">
            Telegram never shows a stored secret back, so copy it before saving. Re-saving with this field empty may drop the stored secret, so enter it again whenever you save.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="maxConnections">Max connections</Label>
          <Input
            id="maxConnections"
            type="number"
            min={1}
            max={100}
            className="w-28"
            value={maxConnections}
            onChange={(e) => setMaxConnections(e.target.value)}
          />
          <FieldError error={maxError} />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Allowed updates</legend>
          <p className="text-xs text-[var(--muted)]">Leave all unchecked for Telegram&apos;s default (everything except a few opt-in types).</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {ALLOWED_UPDATE_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2 font-mono text-xs">
                <input type="checkbox" checked={allowed.includes(type)} onChange={(e) => toggleUpdate(type, e.target.checked)} />
                {type}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={dropPending} onChange={(e) => setDropPending(e.target.checked)} />
          Drop pending updates
        </label>

        {info?.pending_update_count ? (
          <p className="text-xs text-[var(--muted)]">{info.pending_update_count} pending update(s).</p>
        ) : null}
        {info?.ip_address && <p className="text-xs text-[var(--muted)]">Resolved IP: {info.ip_address}</p>}
        {info?.last_error_message && (
          <p className="text-xs text-[var(--danger)]">
            Last error{info.last_error_date ? ` (${new Date(info.last_error_date * 1000).toLocaleString()})` : ""}:{" "}
            {info.last_error_message}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={saving} disabled={invalid}>
            <Link2 className="h-3.5 w-3.5" />
            Set webhook
          </Button>
          {info?.url && (
            <Button type="button" variant="outline" onClick={handleClear} disabled={saving}>
              <Link2Off className="h-3.5 w-3.5" />
              Remove webhook
            </Button>
          )}
        </div>
      </form>
      <p className="mt-4 text-xs text-[var(--muted)]">
        A bot can receive updates via a webhook or via getUpdates (monitoring), never both. Setting a webhook here
        disables this dashboard&apos;s monitoring for the bot.
      </p>
    </Card>
  );
}
