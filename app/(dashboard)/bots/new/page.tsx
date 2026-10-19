"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";

export default function NewBotPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
    <div className="max-w-md">
      <h1 className="mb-6 text-lg font-semibold">Create a new bot</h1>
      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Display name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            <p className="text-xs text-[var(--muted)]">Shown to users in chat. Can be changed later.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="my_cool_bot"
              required
            />
            <p className="text-xs text-[var(--muted)]">Must be unique and end in &quot;bot&quot;. Cannot be changed later.</p>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating via BotFather…" : "Create bot"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
