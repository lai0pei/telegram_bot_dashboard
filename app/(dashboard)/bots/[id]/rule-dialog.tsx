"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { emptyRuleDraft, type RuleDraft } from "./rule-draft";
import { RuleFields } from "./rule-fields";
import { previewOf } from "./rule-preview";
import { TelegramPreview } from "./telegram-preview";
import type { BotDetail } from "./types";

/** Ready-made starting points offered when adding a rule. */
export const QUICK_STARTS: { label: string; draft: () => RuleDraft }[] = [
  {
    label: "Welcome message (/start)",
    draft: () => ({ ...emptyRuleDraft(), matchType: "command", pattern: "start", replyText: "Welcome, {first_name}! Send me a message and I'll get back to you." }),
  },
  {
    label: "Help (/help)",
    draft: () => ({ ...emptyRuleDraft(), matchType: "command", pattern: "help", replyText: "Hi {first_name}! Here is what I can do:\n{commands}" }),
  },
];

/**
 * Adding and editing a rule happens here, not in the page, so the rule list and its phone preview can sit side by side
 * at equal height. The form is on the left and a live preview of the unsaved draft on the right (below `md` the preview
 * is left out; the page shows it once the rule is saved). Closing with unsaved changes is the parent's call (`onClose`).
 */
export function RuleDialog({
  bot,
  open,
  editing,
  draft,
  onDraftChange,
  canSave,
  saving,
  onSave,
  onDelete,
  onClose,
}: {
  bot: BotDetail;
  open: boolean;
  /** Editing a saved rule (shows Delete) rather than adding one. */
  editing: boolean;
  draft: RuleDraft;
  onDraftChange: (draft: RuleDraft) => void;
  canSave: boolean;
  saving: boolean;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const preview = previewOf(draft, bot.id);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <DialogTitle>{editing ? "Edit rule" : "Add a rule"}</DialogTitle>
          {!editing && (
            <div className="flex flex-wrap gap-2">
              {QUICK_STARTS.map((q) => (
                <Button key={q.label} type="button" variant="outline" size="sm" onClick={() => onDraftChange(q.draft())}>
                  {q.label}
                </Button>
              ))}
            </div>
          )}
        </div>
        <DialogDescription className="sr-only">Choose when the bot replies and what it says.</DialogDescription>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-3">
              <RuleFields bot={bot} draft={draft} onChange={onDraftChange} />
            </div>
            <div className="sticky top-0 hidden md:block">
              <p className="mb-2 text-sm font-semibold">How it looks in Telegram</p>
              <TelegramPreview
                mode="chat"
                botName={bot.name ?? bot.firstName}
                username={bot.username}
                photoSrc={`/api/bots/${bot.id}/photo`}
                messages={preview.messages}
                keyboard={preview.keyboard}
                commands={bot.commands}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onSave} disabled={!canSave} loading={saving}>
            {editing ? "Save changes" : "Add rule"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {editing && (
            <Button variant="ghost" className="ml-auto text-[var(--danger)]" onClick={onDelete}>
              <Trash2 className="h-4 w-4" aria-hidden /> Delete rule
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
