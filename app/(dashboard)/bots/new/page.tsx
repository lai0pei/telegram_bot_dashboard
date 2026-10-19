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

export default function NewBotPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState({ name: false, username: false });

  const nameError = validateBotName(name);
  const usernameError = validateBotUsername(username);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ name: true, username: true });
    if (nameError || usernameError) return;
    setLoading(true);
    try {
      const result = await apiFetch<{ id: number }>("/api/bots", { body: { name, username } });
      toast.success("Bot created.");
      router.push(`/bots/${result.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create bot.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <FadeIn className="max-w-md">
      <h1 className="mb-6 text-lg font-semibold">Create a new bot</h1>
      <Card>
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
          <Button type="submit" className="w-full" loading={loading}>
            {loading ? "Creating via BotFather…" : "Create bot"}
          </Button>
        </form>
      </Card>
    </FadeIn>
  );
}
