"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { LinkWizard } from "../link-wizard";

export default function NewTelegramAccountPage() {
  const router = useRouter();

  return (
    <div className="flex justify-center py-8">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-lg font-semibold">Link a Telegram account</h1>
        <LinkWizard
          onLinked={() => {
            router.push("/");
            router.refresh();
          }}
        />
      </Card>
    </div>
  );
}
