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
import { apiFetch } from "@/lib/api-client";
import { validateBotName, validateBotUsername } from "@/lib/validation";
import { randomBotIdentity } from "@/lib/random-names";
import { FadeIn } from "@/components/motion";
import type { BotTemplate } from "@/lib/bot-templates";
import { ALL_PARTS, applyTemplateToBot, TemplatePicker } from "../[id]/template-picker";

export default function NewBotPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<"creating" | "template">("creating");
  const [template, setTemplate] = useState<BotTemplate | null>(null);
  const [touched, setTouched] = useState({ name: false, username: false });

  const nameError = validateBotName(name);
  const usernameError = validateBotUsername(username);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ name: true, username: true });
    if (nameError || usernameError) return;
    setLoading(true);
    setPhase("creating");
    try {
      const result = await apiFetch<{ id: number }>("/api/bots", { body: { name, username } });
      toast.success("Bot created.");
      if (!template) {
        router.push(`/bots/${result.id}`);
        return;
      }
      // The bot exists now, so a template that only half applies must never lose it: report and open the bot anyway.
      setPhase("template");
      try {
        const parts = await applyTemplateToBot(result.id, template.id, ALL_PARTS);
        if (parts.some((p) => p.errors.length)) toast.error("Some parts of the template could not be added. You can retry under Templates.");
        else toast.success(`${template.title} added.`);
      } catch (err) {
        toast.error(err instanceof Error ? `Template not added: ${err.message}` : "The template could not be added.");
      }
      router.push(`/bots/${result.id}?s=builder`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create bot.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <FadeIn className="mx-auto max-w-6xl">
      <h1 className="text-lg font-semibold">Create a new bot</h1>
      <p className="mb-6 mt-1 text-sm text-[var(--muted)]">Name it, then optionally start from a ready-made bot.</p>
      <div className="grid items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="lg:sticky lg:top-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="name">Display name</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const identity = randomBotIdentity();
                    setName(identity.name);
                    setUsername(identity.username);
                  }}
                >
                  <Dices className="h-3.5 w-3.5" aria-hidden />
                  Random
                </Button>
              </div>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                maxLength={64}
                required
                autoFocus
              />
              {touched.name && nameError ? (
                <FieldError error={nameError} />
              ) : (
                <p className="text-xs text-[var(--muted)]">Shown to users in chat. Can be changed later.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, username: true }))}
                placeholder="my_cool_bot"
                maxLength={32}
                required
              />
              {touched.username && usernameError ? (
                <FieldError error={usernameError} />
              ) : (
                <p className="text-xs text-[var(--muted)]">Must be unique and end in &quot;bot&quot;. Cannot be changed later.</p>
              )}
            </div>
            <p className="text-xs text-[var(--muted)]">
              {template ? (
                <>
                  <strong>{template.title}</strong> selected.{" "}
                  <button type="button" onClick={() => setTemplate(null)} className="text-[var(--primary)] hover:underline">
                    Start empty instead
                  </button>
                </>
              ) : (
                "No starting point selected: the bot starts empty."
              )}
            </p>
            <Button type="submit" className="w-full" loading={loading}>
              {loading ? (phase === "template" ? "Adding the template…" : "Creating via BotFather…") : template ? `Create bot with ${template.title}` : "Create bot"}
            </Button>
          </form>
        </Card>

        <Card>
          <div className="mb-3 space-y-1">
            <h2 className="text-sm font-semibold">Starting point (optional)</h2>
            <p className="text-xs text-[var(--muted)]">Pick a ready-made bot and it is set up as soon as it is created. You can change everything afterwards.</p>
          </div>
          <TemplatePicker
            selectedId={template?.id ?? null}
            onSelect={(t) => setTemplate((cur) => (cur?.id === t.id ? null : t))}
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          />
        </Card>
      </div>
    </FadeIn>
  );
}
