"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch, clearMeCache } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/register", { body: { username, password } });
      clearMeCache();
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Card>
          <h1 className="mb-1 text-lg font-semibold">Create an account</h1>
          <p className="mb-6 text-sm text-[var(--muted)]">
            After registering, you&apos;ll link one or more Telegram accounts to manage their bots.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" loading={loading}>
              {loading ? "Creating account…" : "Create account"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-[var(--muted)]">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-[var(--primary)]">
              Sign in
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
