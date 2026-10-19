"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { QrLogin } from "@/components/qr-login";
import { useAccounts } from "../../accounts-context";

export default function NewTelegramAccountPage() {
  const router = useRouter();
  const { reload } = useAccounts();

  return (
    <div className="flex justify-center py-8">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-lg font-semibold">Link a Telegram account</h1>
        <QrLogin
          apiBase="/api/auth"
          doneMessage="Telegram account linked."
          onDone={() => {
            void reload().then(() => router.push("/"));
          }}
        />
      </Card>
    </div>
  );
}
