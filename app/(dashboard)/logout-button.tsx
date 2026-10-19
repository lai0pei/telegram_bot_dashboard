"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiFetch, clearMeCache } from "@/lib/api-client";

export function LogoutButton() {
  const router = useRouter();
  async function handleLogout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      clearMeCache();
      toast.success("Logged out.");
      router.push("/login");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Logout failed.");
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={handleLogout}>
      <LogOut className="h-3.5 w-3.5" />
      Log out
    </Button>
  );
}
