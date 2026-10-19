import type { Metadata } from "next";
import { Toaster } from "sonner";
import { MotionProvider } from "@/components/motion";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bot Dashboard",
  description: "Manage your Telegram bots from one place.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <MotionProvider>{children}</MotionProvider>
        <Toaster position="top-right" richColors theme="system" />
      </body>
    </html>
  );
}
