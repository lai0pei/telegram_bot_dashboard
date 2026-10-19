"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

type Step = "dashboard-password" | "phone" | "code" | "password" | "done";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("dashboard-password");
  const [loading, setLoading] = useState(false);

  const [dashboardPassword, setDashboardPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");

  async function handleDashboardPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiFetch("/api/dashboard-login", { body: { password: dashboardPassword } });
      setStep("phone");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiFetch("/api/auth/send-code", { body: { phoneNumber } });
      toast.success("Code sent — check your Telegram app.");
      setStep("code");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await apiFetch<{ status: "logged_in" | "password_required" }>("/api/auth/sign-in", {
        body: { code },
      });
      if (result.status === "password_required") {
        setStep("password");
      } else {
        setStep("done");
        router.push("/");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid code.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiFetch("/api/auth/password", { body: { password } });
      setStep("done");
      router.push("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Incorrect password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-lg font-semibold">Bot Dashboard</h1>
        <p className="mb-6 text-sm text-[var(--muted)]">
          {step === "dashboard-password" && "Enter the dashboard password to continue."}
          {step === "phone" && "Sign in with your Telegram account to manage your bots."}
          {step === "code" && "Enter the login code Telegram just sent you."}
          {step === "password" && "Your account has 2FA enabled — enter your cloud password."}
        </p>

        {step === "dashboard-password" && (
          <form onSubmit={handleDashboardPassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="dpw">Dashboard password</Label>
              <Input
                id="dpw"
                type="password"
                autoFocus
                value={dashboardPassword}
                onChange={(e) => setDashboardPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Checking…" : "Continue"}
            </Button>
          </form>
        )}

        {step === "phone" && (
          <form onSubmit={handleSendCode} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+15551234567"
                autoFocus
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending…" : "Send code"}
            </Button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="code">Login code</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Verifying…" : "Sign in"}
            </Button>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={handlePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pw">Cloud password</Label>
              <Input
                id="pw"
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Verifying…" : "Sign in"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
