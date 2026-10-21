"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";
import { validateChatAbout, validateChatTitle, validateChatUsername } from "@/lib/validation";
import { FieldError } from "@/components/ui/field-error";
import { Textarea } from "@/components/ui/textarea";
import type { ChatDetail } from "./types";

export function SettingsTab({ chat, onSaved }: { chat: ChatDetail; onSaved: () => void }) {
  const [title, setTitle] = useState(chat.title);
  const [about, setAbout] = useState(chat.about);
  const [username, setUsername] = useState(chat.username ?? "");
  const [saving, setSaving] = useState(false);

  const supportsUsername = chat.kind !== "group";
  const disabled = !chat.canChangeInfo;
  const titleError = validateChatTitle(title);
  const aboutError = validateChatAbout(about);
  const usernameError = supportsUsername ? validateChatUsername(username) : null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (titleError || aboutError || usernameError) return;

    // Only send what changed — Telegram rejects no-op edits, and username changes are rate-limited.
    const body: Record<string, string> = {};
    if (title.trim() !== chat.title) body.title = title;
    if (about !== chat.about) body.about = about;
    const cleanUsername = username.trim().replace(/^@/, "");
    if (supportsUsername && cleanUsername !== (chat.username ?? "")) body.username = cleanUsername;
    if (Object.keys(body).length === 0) {
      toast.info("Nothing to save.");
      return;
    }

    setSaving(true);
    try {
      await apiFetch(`/api/chats/${chat.id}`, { method: "PATCH", body });
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
      {disabled && (
        <p className="mb-4 text-sm text-[var(--muted)]">
          You don&apos;t have the &quot;Change info&quot; admin right here, so these settings are read-only.
        </p>
      )}
      <form onSubmit={handleSave} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={128}
            disabled={disabled}
          />
          <FieldError error={titleError} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="about">Description</Label>
          <Textarea
            rows={5}
            id="about"
            maxLength={255}
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            disabled={disabled}
          />
          <FieldError error={aboutError} />
        </div>
        {supportsUsername && (
          <div className="space-y-1.5">
            <Label htmlFor="username">Public username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="leave empty for private"
              maxLength={33}
              disabled={disabled}
            />
            {usernameError ? (
              <p className="text-xs text-[var(--danger)]">{usernameError}</p>
            ) : (
              <p className="text-xs text-[var(--muted)]">
                Makes it public at t.me/{username.trim().replace(/^@/, "") || "…"}. Clear it to make it private.
              </p>
            )}
          </div>
        )}
        <Button type="submit" loading={saving} disabled={disabled}>
          Save changes
        </Button>
      </form>
    </Card>
  );
}
