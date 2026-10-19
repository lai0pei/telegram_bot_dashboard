"use client";

import { useRouter } from "next/navigation";
import { clearMeCache } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { QrLogin } from "@/components/qr-login";

export default function LoginPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Card>
          <h1 className="mb-1 text-lg font-semibold">Bot Dashboard</h1>
          <p className="mb-6 text-sm text-[var(--muted)]">Sign in with the Telegram account you manage bots from.</p>

          <QrLogin
            apiBase="/api/login"
            doneMessage="Signed in."
            onDone={() => {
              clearMeCache();
              router.push("/");
              router.refresh();
            }}
          />
        </Card>
      </div>
    </div>
  );
}
