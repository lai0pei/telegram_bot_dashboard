"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dices } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api-client";
import { validateChatAbout, validateChatTitle } from "@/lib/validation";
import { randomChatTitle } from "@/lib/random-names";
import { FadeIn } from "@/components/motion";

type Kind = "channel" | "supergroup";

const KIND_OPTIONS: { value: Kind; label: string; hint: string }[] = [
  { value: "channel", label: "Channel", hint: "Broadcast to subscribers. Only admins post." },
  { value: "supergroup", label: "Group", hint: "Everyone can chat. Created as a supergroup." },
];

export default function NewChatPage() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("channel");
  const [title, setTitle] = useState("");
  const [about, setAbout] = useState("");
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const titleError = validateChatTitle(title);
  const aboutError = validateChatAbout(about);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (titleError || aboutError) return;
    setLoading(true);
    try {
      const result = await apiFetch<{ id: number }>("/api/chats", { body: { kind, title, about } });
      toast.success(kind === "channel" ? "Channel created." : "Group created.");
      router.push(`/chats/${result.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <FadeIn className="max-w-md">
      <h1 className="mb-6 text-lg font-semibold">Create a channel or group</h1>
      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {KIND_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setKind(option.value)}
                  aria-pressed={kind === option.value}
                  className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                    kind === option.value
                      ? "border-[var(--primary)] ring-1 ring-[var(--primary)]"
                      : "border-[var(--card-border)] hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                >
                  <div className="font-medium">{option.label}</div>
                  <div className="text-xs text-[var(--muted)]">{option.hint}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="title">Title</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => setTitle(randomChatTitle(kind))}>
                <Dices className="h-3.5 w-3.5" aria-hidden />
                Random
              </Button>
            </div>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setTouched(true)}
              maxLength={128}
              required
              autoFocus
            />
            {touched && <FieldError error={titleError} />}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="about">Description (optional)</Label>
            <Textarea
              rows={5}
              id="about"
              maxLength={255}
              value={about}
              onChange={(e) => setAbout(e.target.value)}
            />
            {aboutError ? (
              <FieldError error={aboutError} />
            ) : (
              <p className="text-xs text-[var(--muted)]">
                Created private. You can set a public username afterwards in Settings.
              </p>
            )}
          </div>
          <Button type="submit" className="w-full" loading={loading}>
            {kind === "channel" ? "Create channel" : "Create group"}
          </Button>
        </form>
      </Card>
    </FadeIn>
  );
}
