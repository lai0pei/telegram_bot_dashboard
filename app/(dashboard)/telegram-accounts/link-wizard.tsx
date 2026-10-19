"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Step = "phone" | "code" | "password" | "not-allowed" | "done";

const STEP_ORDER: Step[] = ["phone", "code", "password"];

/**
 * Phone -> code -> 2FA steps for binding a Telegram account to the current
 * dashboard session. Shared between the standalone /telegram-accounts/new
 * page and the account switcher's "add account" modal.
 */
export function LinkWizard({ onLinked }: { onLinked: () => void }) {
  const [step, setStep] = useState<Step>("phone");
  const [loading, setLoading] = useState(false);

  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [deniedUserId, setDeniedUserId] = useState<string | null>(null);

  const stepIndex = STEP_ORDER.indexOf(step);

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
        toast.success("Telegram account linked.");
        onLinked();
      }
    } catch (err) {
      if (err instanceof ApiError && typeof err.body.telegramUserId === "string") {
        setDeniedUserId(err.body.telegramUserId);
        setStep("not-allowed");
      } else {
        toast.error(err instanceof Error ? err.message : "Invalid code.");
      }
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
      toast.success("Telegram account linked.");
      onLinked();
    } catch (err) {
      if (err instanceof ApiError && typeof err.body.telegramUserId === "string") {
        setDeniedUserId(err.body.telegramUserId);
        setStep("not-allowed");
      } else {
        toast.error(err instanceof Error ? err.message : "Incorrect password.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      {stepIndex >= 0 && (
        <p className="mb-1 text-xs font-medium text-[var(--primary)]">
          Step {stepIndex + 1} of {STEP_ORDER.length}
        </p>
      )}
      <p className="mb-6 text-sm text-[var(--muted)]">
        {step === "phone" && "Sign in with the Telegram account you want to add."}
        {step === "code" && "Enter the login code Telegram just sent you."}
        {step === "password" && "This account has 2FA enabled — enter its cloud password."}
        {step === "not-allowed" && "This Telegram account isn't allowed to use this dashboard yet."}
      </p>

      <AnimatePresence mode="wait" initial={false} custom={stepIndex}>
        <motion.div
          key={step}
          custom={stepIndex}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.2 }}
        >
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
              <Button type="submit" className="w-full" loading={loading}>
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
              <Button type="submit" className="w-full" loading={loading}>
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
              <Button type="submit" className="w-full" loading={loading}>
                {loading ? "Verifying…" : "Sign in"}
              </Button>
            </form>
          )}

          {step === "not-allowed" && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--muted)]">
                Ask the admin to add this Telegram user ID to the allowlist:
              </p>
              <code className="block rounded-lg bg-black/5 px-3 py-2 text-sm dark:bg-white/5">{deniedUserId}</code>
              <Button variant="outline" className="w-full" onClick={() => setStep("phone")}>
                Try a different account
              </Button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
