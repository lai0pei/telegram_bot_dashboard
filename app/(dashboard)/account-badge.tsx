"use client";

import { useEffect, useState } from "react";
import { getMe, type Me } from "@/lib/api-client";

export function AccountBadge() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    void getMe().then(setMe).catch(() => {});
  }, []);

  if (!me?.loggedIn) return null;

  return (
    <span className="hidden text-sm text-[var(--muted)] sm:inline">
      Signed in as {me.username ? `@${me.username}` : me.firstName}
    </span>
  );
}
