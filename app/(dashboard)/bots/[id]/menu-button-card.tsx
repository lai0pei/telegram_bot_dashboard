"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-client";
import { validateMenuButton, validatePrivateChatId } from "@/lib/validation";
import type { MenuButton } from "@/lib/botapi";
import type { BotDetail } from "./types";

type Kind = MenuButton["type"];

const KINDS: { value: Kind; label: string; hint: string }[] = [
  { value: "default", label: "Default", hint: "Telegram's standard button (shows the commands list when there are commands)." },
  { value: "commands", label: "Commands", hint: "Always opens the bot's commands list." },
  { value: "web_app", label: "Web App", hint: "Opens a Mini App at an https:// URL." },
];

/** The menu button next to the message field in private chats: bot-wide, or overridden for one contact. */
export function MenuButtonCard({ bot }: { bot: BotDetail }) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  // "" = everyone (the bot-wide default); otherwise the private chat whose button is being edited.
  const [forContact, setForContact] = useState(false);
  const [contactInput, setContactInput] = useState("");
  const [chatId, setChatId] = useState("");
  const [contacts, setContacts] = useState<{ chatId: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  function apply(menuButton: MenuButton) {
    setKind(menuButton.type);
    setText(menuButton.type === "web_app" ? menuButton.text : "");
    setUrl(menuButton.type === "web_app" ? menuButton.web_app.url : "");
  }

  async function load(forChat: string) {
    setLoading(true);
    try {
      const q = forChat ? `?chatId=${encodeURIComponent(forChat)}` : "";
      apply((await apiFetch<{ menuButton: MenuButton }>(`/api/bots/${bot.id}/menu-button${q}`)).menuButton);
    } catch (err) {
      if (forChat) toast.error(err instanceof Error ? err.message : "Failed to load the menu button.");
      else setKind("default");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Intentional: fetch-on-mount into local state, not state synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot.id]);

  function chooseTarget(contact: boolean) {
    setForContact(contact);
    setChatId("");
    setContactInput("");
    if (contact) {
      // Best effort: the people who wrote to the bot, to suggest in the picker.
      if (!contacts.length) {
        apiFetch<{ contacts: { chatId: string; name: string }[] }>(`/api/bots/${bot.id}/messages`)
          .then((r) => setContacts(r.contacts))
          .catch(() => {});
      }
    } else {
      void load("");
    }
  }

  function loadContact() {
    const error = validatePrivateChatId(contactInput);
    if (error) {
      toast.error(error);
      return;
    }
    setChatId(contactInput.trim());
    void load(contactInput.trim());
  }

  if (kind === null) return <Skeleton className="h-40" />;

  const button: MenuButton =
    kind === "web_app" ? { type: "web_app", text: text.trim(), web_app: { url: url.trim() } } : { type: kind };
  const error = kind === "web_app" && (text || url) ? validateMenuButton(button) : null;
  const invalid = Boolean(validateMenuButton(button)) || (forContact && !chatId);

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/api/bots/${bot.id}/menu-button`, { method: "PUT", body: { menuButton: button, ...(forContact ? { chatId } : {}) } });
      toast.success(forContact ? "Menu button saved for that contact." : "Menu button saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save menu button.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold">Menu button</h3>
      <div className="mb-4 space-y-1.5">
        <select
          aria-label="Who sees this menu button"
          value={forContact ? "contact" : "all"}
          onChange={(e) => chooseTarget(e.target.value === "contact")}
          className="h-9 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <option value="all">Everyone (bot default)</option>
          <option value="contact">One contact…</option>
        </select>
        {forContact && (
          <>
            <div className="flex gap-2">
              <Input
                list="menu-contacts"
                value={contactInput}
                onChange={(e) => setContactInput(e.target.value)}
                placeholder="Pick or type a user ID"
                aria-label="Contact"
                className="min-w-0 flex-1"
              />
              <datalist id="menu-contacts">
                {contacts.map((c) => (
                  <option key={c.chatId} value={c.chatId}>
                    {c.name}
                  </option>
                ))}
              </datalist>
              <Button variant="outline" size="sm" onClick={loadContact} disabled={loading}>
                Load
              </Button>
            </div>
            <p className="text-xs text-[var(--muted)]">
              Only that person sees this button; everyone else keeps the bot default. Choose &quot;Default&quot; below and save to remove their override.
            </p>
          </>
        )}
      </div>
      <div className={loading ? "pointer-events-none space-y-2 opacity-60" : "space-y-2"} role="radiogroup" aria-label="Menu button type">
        {KINDS.map((k) => (
          <label key={k.value} className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="radio"
              name="menu-button-kind"
              className="mt-1"
              checked={kind === k.value}
              onChange={() => setKind(k.value)}
            />
            <span>
              <span className="font-medium">{k.label}</span>
              <span className="block text-xs text-[var(--muted)]">{k.hint}</span>
            </span>
          </label>
        ))}
      </div>
      {kind === "web_app" && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="menuText">Button text</Label>
            <Input id="menuText" maxLength={64} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="menuUrl">Web App URL</Label>
            <Input id="menuUrl" placeholder="https://example.com/app" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <FieldError error={error} />
          </div>
        </div>
      )}
      <div className="mt-4">
        <Button size="sm" onClick={save} loading={saving} disabled={invalid}>
          Save menu button
        </Button>
      </div>
    </Card>
  );
}
