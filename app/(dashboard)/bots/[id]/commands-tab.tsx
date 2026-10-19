"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import type { BotCommand, BotDetail } from "./types";

export function CommandsTab({ bot, onSaved }: { bot: BotDetail; onSaved: () => void }) {
  const [commands, setCommands] = useState<BotCommand[]>(bot.commands?.length ? bot.commands : [{ command: "", description: "" }]);
  const [saving, setSaving] = useState(false);

  function updateCommand(index: number, field: keyof BotCommand, value: string) {
    setCommands((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  }

  function addRow() {
    setCommands((prev) => [...prev, { command: "", description: "" }]);
  }

  function removeRow(index: number) {
    setCommands((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const cleaned = commands
        .map((c) => ({ command: c.command.trim().replace(/^\//, ""), description: c.description.trim() }))
        .filter((c) => c.command && c.description);
      await apiFetch(`/api/bots/${bot.id}`, { method: "PATCH", body: { commands: cleaned } });
      toast.success("Commands saved.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save commands.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold">Commands menu</h3>
      <p className="mb-4 text-xs text-[var(--muted)]">
        Shown to users when they type &quot;/&quot; in chat with the bot. Up to 32 bytes per command, 256 per description.
      </p>
      <div className="space-y-2">
        {commands.map((cmd, i) => (
          <div key={i} className="flex gap-2">
            <Input
              placeholder="start"
              value={cmd.command}
              onChange={(e) => updateCommand(i, "command", e.target.value)}
              className="w-32 font-mono"
              maxLength={32}
            />
            <Input
              placeholder="Description"
              value={cmd.description}
              onChange={(e) => updateCommand(i, "description", e.target.value)}
              className="flex-1"
              maxLength={256}
            />
            <Button variant="ghost" size="icon" type="button" onClick={() => removeRow(i)}>
              ✕
            </Button>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" size="sm" onClick={addRow}>
          Add command
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save commands"}
        </Button>
      </div>
    </Card>
  );
}
