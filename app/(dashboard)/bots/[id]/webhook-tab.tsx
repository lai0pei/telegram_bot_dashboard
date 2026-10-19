"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link2, Link2Off } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { validateWebhookUrl } from "@/lib/validation";
import { FieldError } from "@/components/ui/field-error";
import type { BotDetail } from "./types";

export function WebhookTab({ bot, onChange }: { bot: BotDetail; onChange: () => void }) {
  const [url, setUrl] = useState(bot.webhook?.url ?? "");
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const urlError = url ? validateWebhookUrl(url) : null;

  async function handleSet(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (urlError) return;
    setSaving(true);
    try {
      await apiFetch(`/api/bots/${bot.id}/webhook`, { method: "PUT", body: { url } });
      toast.success("Webhook updated.");
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
      await apiFetch(`/api/bots/${bot.id}/webhook`, { method: "PUT", body: { url: null, dropPendingUpdates: false } });
      setUrl("");
      toast.success("Webhook removed.");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove webhook.");
    } finally {
      setSaving(false);
    }
  }

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

        {bot.webhook?.pending_update_count ? (
          <p className="text-xs text-[var(--muted)]">{bot.webhook.pending_update_count} pending update(s).</p>
        ) : null}
        {bot.webhook?.last_error_message && (
          <p className="text-xs text-[var(--danger)]">Last error: {bot.webhook.last_error_message}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={saving} disabled={!url || Boolean(urlError)}>
            <Link2 className="h-3.5 w-3.5" />
            Set webhook
          </Button>
          {bot.webhook?.url && (
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
