"use client";

import { Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field-error";
import { apiFetch } from "@/lib/api-client";
import { validateCommand, validateCommandDescription } from "@/lib/validation";
import { spring } from "@/components/motion";
import type { BotCommand, BotDetail } from "./types";

// Stable per-row IDs so AnimatePresence can animate removal correctly (array index shifts on delete).
// A module-level counter (not a ref) since it's only ever read/written in event handlers, never during render.
let nextCommandKey = 0;

interface CommandRow extends BotCommand {
  key: number;
}

export function CommandsTab({ bot, onSaved }: { bot: BotDetail; onSaved: () => void }) {
  const [commands, setCommands] = useState<CommandRow[]>(() => {
    const initial = bot.commands?.length ? bot.commands : [{ command: "", description: "" }];
    return initial.map((c) => ({ ...c, key: nextCommandKey++ }));
  });
  const [saving, setSaving] = useState(false);

  function rowError(cmd: CommandRow): string | null {
    const command = cmd.command.trim().replace(/^\//, "");
    const description = cmd.description.trim();
    if (!command && !description) return null;
    return validateCommand(command) ?? validateCommandDescription(description);
  }

  const errors = commands.map(rowError);
  const hasErrors = errors.some(Boolean);

  function updateCommand(key: number, field: keyof BotCommand, value: string) {
    setCommands((prev) => prev.map((c) => (c.key === key ? { ...c, [field]: value } : c)));
  }

  function addRow() {
    setCommands((prev) => [...prev, { command: "", description: "", key: nextCommandKey++ }]);
  }

  function removeRow(key: number) {
    setCommands((prev) => prev.filter((c) => c.key !== key));
  }

  async function handleSave() {
    if (hasErrors) return;
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
        <AnimatePresence initial={false}>
          {commands.map((cmd, i) => (
            <motion.div
              key={cmd.key}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={spring}
              className="overflow-hidden"
            >
              <div className="flex gap-2 py-0.5">
                <Input
                  placeholder="start"
                  value={cmd.command}
                  onChange={(e) => updateCommand(cmd.key, "command", e.target.value)}
                  className="w-32 font-mono"
                  maxLength={32}
                />
                <Input
                  placeholder="Description"
                  value={cmd.description}
                  onChange={(e) => updateCommand(cmd.key, "description", e.target.value)}
                  className="flex-1"
                  maxLength={256}
                />
                <Button variant="ghost" size="icon" type="button" onClick={() => removeRow(cmd.key)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <FieldError error={errors[i]} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="h-3.5 w-3.5" />
          Add command
        </Button>
        <Button size="sm" onClick={handleSave} loading={saving} disabled={hasErrors}>
          Save commands
        </Button>
      </div>
    </Card>
  );
}
