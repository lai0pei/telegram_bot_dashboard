"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";
import type { BotDetail } from "./types";

export function SettingsTab({ bot, onSaved }: { bot: BotDetail; onSaved: () => void }) {
  const [name, setName] = useState(bot.name ?? bot.firstName);
  const [shortDescription, setShortDescription] = useState(bot.shortDescription ?? "");
  const [description, setDescription] = useState(bot.description ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/api/bots/${bot.id}`, {
        method: "PATCH",
        body: { name, shortDescription, description },
      });
      toast.success("Settings saved.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="shortDesc">Short description</Label>
          <Input
            id="shortDesc"
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
            maxLength={120}
          />
          <p className="text-xs text-[var(--muted)]">Shown on the bot&apos;s profile, above &quot;Start&quot;.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="desc">Description</Label>
          <textarea
            id="desc"
            className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            rows={4}
            maxLength={512}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <p className="text-xs text-[var(--muted)]">Shown on the empty chat screen before the user starts the bot.</p>
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </Card>
  );
}
