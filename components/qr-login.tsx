"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateLoginCode, validatePhoneNumber } from "@/lib/validation";

type Step = "qr" | "phone" | "code" | "password" | "failed" | "not-allowed" | "registration-closed" | "done";

const QR_STEPS: Step[] = ["qr", "password"];
const PHONE_STEPS: Step[] = ["phone", "code", "password"];

const QR_POLL_INTERVAL_MS = 2000;

type QrPoll =
  | { status: "waiting"; qrDataUrl: string; expiresAt: number }
  | { status: "logged_in" | "password_required" };

/**
 * QR scan -> optional 2FA steps, shared by dashboard sign-in (/api/login/*,
 * no dashboard user yet) and binding an extra Telegram account to the
 * caller's dashboard user (/api/auth/*, used by /telegram-accounts/new and
 * the account switcher's "add account" modal). `apiBase` picks which pair of
 * routes to poll; both expose the same shape (POST to start, GET to poll,
 * POST .../password for 2FA).
 */
export function QrLogin({
  apiBase,
  doneMessage,
  onDone,
}: {
  apiBase: "/api/login" | "/api/auth";
  doneMessage: string;
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>("qr");
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);

  const [password, setPassword] = useState("");
  const [deniedUserId, setDeniedUserId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeViaApp, setCodeViaApp] = useState(true);
  // Which first factor the 2FA step (and the step counter) belongs to.
  const [usingPhone, setUsingPhone] = useState(false);

  const stepOrder = usingPhone ? PHONE_STEPS : QR_STEPS;
  const stepIndex = stepOrder.indexOf(step);

  function handleLoginError(err: unknown, fallback: string) {
    if (err instanceof ApiError && err.body.code === "NOT_ALLOWED" && typeof err.body.telegramUserId === "string") {
      setDeniedUserId(err.body.telegramUserId);
      setStep("not-allowed");
    } else if (
      err instanceof ApiError &&
      err.body.code === "REGISTRATION_CLOSED" &&
      typeof err.body.telegramUserId === "string"
    ) {
      setDeniedUserId(err.body.telegramUserId);
      setStep("registration-closed");
    } else {
      toast.error(err instanceof Error ? err.message : fallback);
      setStep("failed");
    }
  }

  function handleDone() {
    setStep("done");
    toast.success(doneMessage);
    onDone();
  }

  function restart() {
    setQrDataUrl(null);
    setPassword("");
    setPhone("");
    setCode("");
    setUsingPhone(false);
    setDeniedUserId(null);
    setStep("qr");
    setAttempt((n) => n + 1);
  }

  const onQrStep = step === "qr";

  useEffect(() => {
    if (!onQrStep) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const result = await apiFetch<QrPoll>(`${apiBase}/qr`);
        if (cancelled) return;
        if (result.status === "waiting") {
          setQrDataUrl(result.qrDataUrl);
          timer = setTimeout(poll, QR_POLL_INTERVAL_MS);
        } else if (result.status === "password_required") {
          setStep("password");
        } else {
          handleDone();
        }
      } catch (err) {
        if (!cancelled) handleLoginError(err, "QR login failed.");
      }
    }

    (async () => {
      try {
        await apiFetch(`${apiBase}/qr`, { method: "POST" });
      } catch (err) {
        if (!cancelled) handleLoginError(err, "Failed to start QR login.");
        return;
      }
      if (!cancelled) poll();
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new QR login starts only on entering the step or retrying
  }, [onQrStep, attempt]);

  async function handlePhone(e: React.FormEvent) {
    e.preventDefault();
    const invalid = validatePhoneNumber(phone);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{ isCodeViaApp: boolean }>(`${apiBase}/phone`, { body: { phone } });
      setCodeViaApp(res.isCodeViaApp);
      setCode("");
      setStep("code");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send the code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCode(e: React.FormEvent) {
    e.preventDefault();
    const invalid = validateLoginCode(code);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setLoading(true);
    try {
      const result = await apiFetch<{ status: "logged_in" | "password_required" }>(`${apiBase}/phone/code`, {
        body: { code },
      });
      if (result.status === "password_required") setStep("password");
      else handleDone();
    } catch (err) {
      if (err instanceof ApiError && typeof err.body.telegramUserId === "string") {
        handleLoginError(err, "Sign-in failed.");
      } else {
        // A wrong code keeps the login alive server-side (a few tries), so stay and let them retry.
        toast.error(err instanceof Error ? err.message : "Incorrect code.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setLoading(true);
    try {
      const res = await apiFetch<{ isCodeViaApp: boolean }>(`${apiBase}/phone/resend`, { method: "POST" });
      setCodeViaApp(res.isCodeViaApp);
      toast.success("A new code was sent.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't resend the code.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiFetch(`${apiBase}/password`, { body: { password } });
      handleDone();
    } catch (err) {
      if (err instanceof ApiError && typeof err.body.telegramUserId === "string") {
        handleLoginError(err, "Incorrect password.");
      } else {
        // A wrong password keeps the login alive server-side, so stay here and let them retry.
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
          Step {stepIndex + 1} of {stepOrder.length}
        </p>
      )}
      <p className="mb-6 text-sm text-[var(--muted)]">
        {step === "qr" && "Scan this code with the Telegram app on your phone."}
        {step === "phone" && "Enter the phone number of your Telegram account."}
        {step === "code" &&
          (codeViaApp
            ? "Enter the code Telegram just sent to your Telegram app on another device."
            : "Enter the code Telegram just sent you by SMS.")}
        {step === "password" && "This account has 2FA enabled — enter its cloud password."}
        {step === "failed" && "Didn't complete. Generate a new code to try again."}
        {step === "not-allowed" && "This Telegram account isn't allowed to use this dashboard yet."}
        {step === "registration-closed" && "This dashboard isn't open for new sign-ups."}
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
          {step === "qr" && (
            <div className="space-y-4">
              <div className="mx-auto flex h-60 w-60 items-center justify-center rounded-xl bg-white p-2">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data URL from our own API, nothing to optimize
                  <img src={qrDataUrl} alt="Telegram login QR code" className="h-full w-full" />
                ) : (
                  <span className="text-xs text-neutral-500">Generating code…</span>
                )}
              </div>
              <ol className="list-decimal space-y-1 pl-5 text-xs text-[var(--muted)]">
                <li>Open Telegram on your phone.</li>
                <li>
                  Go to <span className="font-medium">Settings → Devices → Link Desktop Device</span>.
                </li>
                <li>Point your phone at this code. It refreshes automatically.</li>
              </ol>
              <p className="text-xs text-[var(--muted)]">
                If your account has 2FA you&apos;ll be asked for your cloud password after scanning.
              </p>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setUsingPhone(true);
                  setStep("phone");
                }}
              >
                Use phone number instead
              </Button>
            </div>
          )}

          {step === "phone" && (
            <form onSubmit={handlePhone} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone number</Label>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+1 555 123 4567"
                  autoFocus
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" loading={loading}>
                {loading ? "Sending…" : "Send code"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" disabled={loading} onClick={restart}>
                Use QR code instead
              </Button>
            </form>
          )}

          {step === "code" && (
            <form onSubmit={handleCode} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="code">Login code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" loading={loading}>
                {loading ? "Verifying…" : "Sign in"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" disabled={loading} onClick={handleResend}>
                Resend code
              </Button>
              <Button type="button" variant="ghost" className="w-full" disabled={loading} onClick={restart}>
                Start over
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
              <Button type="button" variant="ghost" className="w-full" disabled={loading} onClick={restart}>
                Start over
              </Button>
            </form>
          )}

          {step === "failed" && (
            <Button variant="outline" className="w-full" onClick={restart}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              Generate a new code
            </Button>
          )}

          {(step === "not-allowed" || step === "registration-closed") && (
            <div className="space-y-4">
              {step === "not-allowed" ? (
                <>
                  <p className="text-sm text-[var(--muted)]">
                    Ask the admin to add this Telegram user ID to the allowlist:
                  </p>
                  <code className="block rounded-lg bg-black/5 px-3 py-2 text-sm dark:bg-white/5">
                    {deniedUserId}
                  </code>
                </>
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  Ask an admin to link your Telegram account first, or try a different one. Your Telegram ID:{" "}
                  <code className="rounded bg-black/5 px-1.5 py-0.5 dark:bg-white/5">{deniedUserId}</code>
                </p>
              )}
              <Button variant="outline" className="w-full" onClick={restart}>
                Try a different account
              </Button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
