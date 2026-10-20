"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import { validateBotToken } from "@/lib/validation";

interface Added {
  id: number;
  username: string;
  webhookUrl: string | null;
}

/**
 * Adds a bot this account doesn't own, from its token (the owner gave it to you to manage). The token is checked with
 * Telegram on the server; nothing the person types ends up as the bot's name or id.
 */
export function AddTokenDialog({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (open: boolean) => void; onAdded: () => void }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<Added | null>(null);
  const error = token ? validateBotToken(token) : null;

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setToken("");
      setAdded(null);
    }
  }

  async function submit() {
    setBusy(true);
    try {
      const result = await apiFetch<Added>("/api/bots/token", { body: { token: token.trim() } });
      setToken("");
      onAdded();
      // A bot that has a webhook is probably served by the owner's own server: say so before they turn monitoring on.
      if (result.webhookUrl) setAdded(result);
      else {
        toast.success(`@${result.username} added.`);
        close(false);
        router.push(`/bots/${result.id}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add the bot.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        {added ? (
          <>
            <DialogTitle>@{added.username} was added</DialogTitle>
            <DialogDescription>
              This bot is connected to a server ({hostOf(added.webhookUrl)}) through a webhook. Profile, commands, templates and broadcasts work as usual. Messages,
              auto-replies and stats need <strong>monitoring</strong>, which can&apos;t run next to a webhook: you would have to remove the owner&apos;s webhook, which
              switches their server off. Don&apos;t do that unless the owner agrees.
            </DialogDescription>
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => {
                  close(false);
                  router.push(`/bots/${added.id}`);
                }}
              >
                Open the bot
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogTitle>Add a bot by its token</DialogTitle>
            <DialogDescription>
              For a bot someone else owns and asked you to manage. Ask the owner for its token (from @BotFather). <strong>A token gives full control of the bot</strong>,
              so only add bots you&apos;re allowed to manage. You can customize and run it from here, but photo, usernames, BotFather settings, token revoking and deletion
              stay with the owner.
            </DialogDescription>
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!error && token) void submit();
              }}
            >
              <Input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="123456789:AAH…"
                aria-label="Bot token"
                autoComplete="off"
                spellCheck={false}
                autoFocus
              />
              {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => close(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" loading={busy} disabled={!token || Boolean(error)}>
                  Add bot
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function hostOf(url: string | null): string {
  try {
    return url ? new URL(url).host : "their server";
  } catch {
    return "their server";
  }
}
