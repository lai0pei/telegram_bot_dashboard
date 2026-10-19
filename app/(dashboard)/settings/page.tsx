"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);

  async function handleSignOutOthers() {
    setLoading(true);
    try {
      await apiFetch("/api/account/sessions", { method: "POST" });
      toast.success("Signed out of every other browser. This one stays signed in.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to sign out other browsers.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Settings</h1>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
        </CardHeader>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Sign out of this dashboard everywhere except the browser you&apos;re using right now. Useful if you signed
          in somewhere you no longer trust.
        </p>
        <Button variant="outline" loading={loading} onClick={handleSignOutOthers}>
          Sign out of all other browsers
        </Button>
      </Card>
    </div>
  );
}
