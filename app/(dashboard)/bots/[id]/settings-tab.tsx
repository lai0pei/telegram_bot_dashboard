"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";
import { validateBotName, validateDescription, validateShortDescription } from "@/lib/validation";
import { FieldError } from "@/components/ui/field-error";
import { LanguageSelect } from "./language-select";
import type { BotDetail } from "./types";

export interface ProfileDraft {
  name: string;
  shortDescription: string;
  description: string;
}

export function SettingsTab({ bot, onSaved, onDraftChange }: { bot: BotDetail; onSaved: () => void; onDraftChange?: (draft: ProfileDraft) => void }) {
  const [name, setName] = useState(bot.name ?? bot.firstName);
  const [shortDescription, setShortDescription] = useState(bot.shortDescription ?? "");
  const [description, setDescription] = useState(bot.description ?? "");
  const [saving, setSaving] = useState(false);
  const [lang, setLang] = useState("");
  const [loadingLang, setLoadingLang] = useState(false);
  // Ignores a slow response for a language the user has already switched away from.
  const langRequest = useRef(0);

  // Reports the fields as they are being typed (called from the handlers, not an effect) so a preview can follow along.
  function edit(patch: Partial<ProfileDraft>) {
    const next = { name, shortDescription, description, ...patch };
    if (patch.name !== undefined) setName(patch.name);
    if (patch.shortDescription !== undefined) setShortDescription(patch.shortDescription);
    if (patch.description !== undefined) setDescription(patch.description);
    onDraftChange?.(next);
  }

  // For a specific language an empty name is allowed: it removes that language's override.
  const nameError = lang && !name ? null : validateBotName(name);
  const shortDescriptionError = validateShortDescription(shortDescription);
  const descriptionError = validateDescription(description);

  async function changeLang(code: string) {
    setLang(code);
    const request = ++langRequest.current;
    if (code === "") {
      edit({ name: bot.name ?? bot.firstName, shortDescription: bot.shortDescription ?? "", description: bot.description ?? "" });
      return;
    }
    setLoadingLang(true);
    try {
      const p = await apiFetch<{ name: string; description: string; shortDescription: string }>(
        `/api/bots/${bot.id}/profile?lang=${code}`
      );
      if (request !== langRequest.current) return;
      edit({ name: p.name, shortDescription: p.shortDescription, description: p.description });
    } catch (err) {
      if (request === langRequest.current) toast.error(err instanceof Error ? err.message : "Failed to load language.");
    } finally {
      if (request === langRequest.current) setLoadingLang(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (nameError || shortDescriptionError || descriptionError) return;
    setSaving(true);
    try {
      await apiFetch(`/api/bots/${bot.id}`, {
        method: "PATCH",
        body: { name, shortDescription, description, languageCode: lang },
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
      <div className="mb-4 space-y-1.5">
        <Label>Language</Label>
        <LanguageSelect value={lang} onChange={changeLang} />
        {lang && (
          <p className="text-xs text-[var(--muted)]">
            Shown to users whose Telegram app is set to this language. Leave a field empty to fall back to the default.
          </p>
        )}
      </div>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => edit({ name: e.target.value })} maxLength={64} />
          <FieldError error={nameError} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="shortDesc">Short description</Label>
          <Input
            id="shortDesc"
            value={shortDescription}
            onChange={(e) => edit({ shortDescription: e.target.value })}
            maxLength={120}
          />
          {shortDescriptionError ? (
            <p className="text-xs text-[var(--danger)]">{shortDescriptionError}</p>
          ) : (
            <p className="text-xs text-[var(--muted)]">Shown on the bot&apos;s profile, above &quot;Start&quot;.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="desc">Description</Label>
          <textarea
            id="desc"
            className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            rows={4}
            maxLength={512}
            value={description}
            onChange={(e) => edit({ description: e.target.value })}
          />
          {descriptionError ? (
            <p className="text-xs text-[var(--danger)]">{descriptionError}</p>
          ) : (
            <p className="text-xs text-[var(--muted)]">Shown on the empty chat screen before the user starts the bot.</p>
          )}
        </div>
        <Button type="submit" loading={saving} disabled={loadingLang}>
          Save changes
        </Button>
      </form>
    </Card>
  );
}
