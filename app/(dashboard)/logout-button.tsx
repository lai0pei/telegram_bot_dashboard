"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";

export function LogoutButton() {
  const router = useRouter();
  async function handleLogout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      toast.success("Logged out.");
      router.push("/login");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Logout failed.");
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={handleLogout}>
      Log out
    </Button>
  );
}
