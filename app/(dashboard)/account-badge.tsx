"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface Me {
  loggedIn: boolean;
  username?: string | null;
  firstName?: string | null;
}

export function AccountBadge() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    void apiFetch<Me>("/api/me").then(setMe).catch(() => {});
  }, []);

  if (!me?.loggedIn) return null;

  return (
    <span className="text-sm text-[var(--muted)]">
      Signed in as {me.username ? `@${me.username}` : me.firstName}
    </span>
  );
}
