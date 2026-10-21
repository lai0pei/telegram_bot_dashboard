"use client";

import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiFetch, clearMeCache } from "@/lib/api-client";

export function LogoutButton({ compact = false }: { /** Icon only, for the narrow nav rail. */ compact?: boolean }) {
  async function handleLogout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      clearMeCache();
      // Full reload on purpose: drops the client router cache (which may hold a redirect for "/") and all state of the old session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Logout failed.");
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={handleLogout} aria-label="Log out" title="Log out">
      <LogOut className="h-3.5 w-3.5" />
      {!compact && "Log out"}
    </Button>
  );
}
