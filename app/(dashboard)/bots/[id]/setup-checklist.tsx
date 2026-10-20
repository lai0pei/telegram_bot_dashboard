"use client";

import { Check, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import { setupFlags, setupProgress } from "@/lib/setup-progress";
import { validateDescription, validateShortDescription } from "@/lib/validation";
import { ESSENTIAL_COMMANDS } from "./essential-commands";
import { MonitorToggle } from "./monitor-toggle";
import type { SectionId } from "./sections";
import { TelegramPreview } from "./telegram-preview";
import type { AutoReplyRule, BotDetail } from "./types";

const DEFAULT_WELCOME = "Welcome, {first_name}! 👋 Send me a message and I'll get back to you.";

/** localStorage is a per-viewer convenience only: every read and write is guarded. */
function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeFlag(key: string, on: boolean) {
  try {
    if (on) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    // The checklist still works for this visit.
  }
}

type StepId = "photo" | "short" | "about" | "welcome" | "commands" | "listening" | "try";

interface Step {
  id: StepId;
  title: string;
  why: string;
  done: boolean;
  optional?: boolean;
}

/**
 * "Get your bot ready": what a new bot still lacks, worked out from data the page already has (nothing is stored but
 * two per-browser flags). The first unfinished step is open; text steps can be filled in right here next to a preview.
 */
export function SetupChecklist({
  bot,
  photoSrc,
  hasPhoto,
  rules,
  onReload,
  onRulesChanged,
  onOpen,
}: {
  bot: BotDetail;
  photoSrc: string;
  /** Whether the bot has a profile photo; null while unknown. Loaded by the page (the sidebar badge counts it too). */
  hasPhoto: boolean | null;
  /** null while the rules are still loading. */
  rules: AutoReplyRule[] | null;
  onReload: () => void;
  onRulesChanged: () => void;
  onOpen: (section: SectionId) => void;
}) {
  const hiddenKey = `tgdash:setup-hidden:${bot.id}`;
  const triedKey = `tgdash:setup-tried:${bot.id}`;
  const [hidden, setHidden] = useState(() => readFlag(hiddenKey));
  const [tried, setTried] = useState(() => readFlag(triedKey));
  const [openStep, setOpenStep] = useState<StepId | "" | null>(null);
  const [short, setShort] = useState(bot.shortDescription ?? "");
  const [about, setAbout] = useState(bot.description ?? "");
  // null until the owner types: the textbox then shows the saved /start reply (or the suggested one) and saving never swaps it for the suggestion.
  const [welcomeDraft, setWelcomeDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const startRule = rules?.find((r) => r.matchType === "command" && r.pattern === "start");
  const welcome = welcomeDraft ?? startRule?.replyText ?? DEFAULT_WELCOME;
  const flags = setupFlags({
    hasPhoto,
    shortDescription: bot.shortDescription,
    description: bot.description,
    startRuleEnabled: Boolean(startRule?.enabled),
    commandsCount: bot.commands?.length ?? 0,
    monitorEnabled: bot.monitorEnabled,
    webhookUrl: bot.webhook?.url,
  });
  const steps: Step[] = [
    { id: "photo", title: "Add a profile photo", why: "A face makes the bot recognisable in chat lists and search.", done: flags.photo },
    { id: "short", title: "Write a short description", why: "One line on the bot's profile, above the Start button.", done: flags.short },
    { id: "about", title: "Explain what the bot does", why: "Shown on the empty chat before anyone presses Start.", done: flags.about },
    { id: "welcome", title: "Write a welcome message", why: "What the bot says right after Start. Without it, it stays silent.", done: flags.welcome },
    { id: "commands", title: "Add a commands menu", why: "The list people see when they type “/”.", done: flags.commands },
    {
      id: "listening",
      title: "Turn on replies",
      why: "Automatic replies only work while the dashboard is listening for messages (monitoring).",
      done: flags.listening,
    },
    { id: "try", title: "Try it in Telegram", why: "Open your bot, press Start and see what people will see.", done: tried, optional: true },
  ];
  // The optional "try it" step is shown but not counted, so the figure matches the sidebar badge and the bot cards.
  const { done: doneCount, total: totalCount } = setupProgress(flags);
  const firstTodo = steps.find((s) => !s.done)?.id ?? "";
  const active = openStep ?? firstTodo;

  async function run(job: () => Promise<void>, success: string) {
    setBusy(true);
    try {
      await job();
      toast.success(success);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const saveProfile = (body: Record<string, string>) => run(async () => { await apiFetch(`/api/bots/${bot.id}`, { method: "PATCH", body }); onReload(); }, "Saved.");
  const saveWelcome = () =>
    run(async () => {
      // Keep whatever else the existing rule has (formatting, buttons, keyboard); only the text and "on" change.
      const body = {
        matchType: "command",
        pattern: "start",
        replyText: welcome,
        parseMode: startRule?.parseMode ?? null,
        buttons: startRule?.buttons ?? null,
        replyKeyboard: startRule?.replyKeyboard ?? null,
        showAlert: false,
        callbackAction: "toast",
        enabled: true,
      };
      if (startRule) await apiFetch(`/api/bots/${bot.id}/auto-replies/${startRule.id}`, { method: "PATCH", body });
      else await apiFetch(`/api/bots/${bot.id}/auto-replies`, { body });
      onRulesChanged();
    }, startRule ? "Welcome message updated." : "Welcome message added.");
  const addEssentials = () =>
    run(async () => {
      await apiFetch(`/api/bots/${bot.id}/commands`, { method: "PUT", body: { scope: "default", languageCode: "", commands: ESSENTIAL_COMMANDS } });
      onReload();
    }, "Commands added.");

  if (hidden) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-dashed border-[var(--card-border)] px-4 py-2 text-sm">
        <span className="text-[var(--muted)]">
          Setup guide · {doneCount} of {totalCount} done
        </span>
        <Button variant="ghost" size="sm" onClick={() => { writeFlag(hiddenKey, false); setHidden(false); }}>
          Show
        </Button>
      </div>
    );
  }

  const shortError = validateShortDescription(short);
  const aboutError = validateDescription(about);

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--card-border)] px-5 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{doneCount === totalCount ? "Your bot is ready 🎉" : "Get your bot ready"}</h2>
          <p className="text-xs text-[var(--muted)]">
            {doneCount} of {totalCount} done
          </p>
        </div>
        <div className="h-2 w-40 overflow-hidden rounded-full bg-[var(--card-border)]" role="progressbar" aria-valuemin={0} aria-valuemax={totalCount} aria-valuenow={doneCount}>
          <div className="h-full bg-[var(--success)] transition-all" style={{ width: `${(doneCount / totalCount) * 100}%` }} />
        </div>
        <Button variant="ghost" size="sm" onClick={() => { writeFlag(hiddenKey, true); setHidden(true); }}>
          Hide
        </Button>
      </div>
      <ol className="divide-y divide-[var(--card-border)]">
        {steps.map((step) => {
          const open = active === step.id;
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => setOpenStep(open ? "" : step.id)}
                aria-expanded={open}
                className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${step.done ? "border-[var(--success)] bg-[var(--success)] text-white" : "border-[var(--muted)]"}`}
                  aria-hidden
                >
                  {step.done && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`text-sm font-medium ${step.done ? "text-[var(--muted)] line-through" : ""}`}>{step.title}</span>
                  {step.optional && <span className="ml-2 text-xs text-[var(--muted)]">optional</span>}
                  {!open && <span className="block truncate text-xs text-[var(--muted)]">{step.why}</span>}
                </span>
                {open ? <ChevronDown className="h-4 w-4 text-[var(--muted)]" aria-hidden /> : <ChevronRight className="h-4 w-4 text-[var(--muted)]" aria-hidden />}
              </button>
              {open && (
                <div className="grid gap-4 px-5 pb-5 pl-14 md:grid-cols-[minmax(0,1fr)_260px]">
                  <div className="space-y-3 text-sm">
                    <p className="text-[var(--muted)]">{step.why}</p>
                    {step.id === "photo" &&
                      (bot.source === "token" ? (
                        <p className="text-xs text-[var(--muted)]">Only the bot&apos;s owner can set its photo (in @BotFather). Ask them to add one.</p>
                      ) : (
                        <Button size="sm" onClick={() => onOpen("profile")}>
                          {step.done ? "Change the photo" : "Upload a photo"}
                        </Button>
                      ))}
                    {step.id === "short" && (
                      <>
                        <Input value={short} onChange={(e) => setShort(e.target.value)} maxLength={120} placeholder="e.g. Orders, support and news from our shop" aria-label="Short description" />
                        {shortError && <p className="text-xs text-[var(--danger)]">{shortError}</p>}
                        <Button size="sm" loading={busy} disabled={Boolean(shortError) || !short.trim() || !bot.hasToken} onClick={() => void saveProfile({ shortDescription: short })}>
                          Save
                        </Button>
                      </>
                    )}
                    {step.id === "about" && (
                      <>
                        <textarea
                          value={about}
                          onChange={(e) => setAbout(e.target.value)}
                          rows={4}
                          maxLength={512}
                          aria-label="Description"
                          placeholder="Tell people what they can do here, in a few sentences."
                          className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                        />
                        {aboutError && <p className="text-xs text-[var(--danger)]">{aboutError}</p>}
                        <Button size="sm" loading={busy} disabled={Boolean(aboutError) || !about.trim() || !bot.hasToken} onClick={() => void saveProfile({ description: about })}>
                          Save
                        </Button>
                      </>
                    )}
                    {step.id === "welcome" && (
                      <>
                        {startRule && !startRule.enabled && <p className="text-xs text-[var(--danger)]">A /start rule exists but is switched off. Saving turns it on.</p>}
                        <textarea
                          value={welcome}
                          onChange={(e) => setWelcomeDraft(e.target.value)}
                          rows={3}
                          maxLength={4096}
                          aria-label="Welcome message"
                          className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <Button size="sm" loading={busy} disabled={rules === null || !welcome.trim()} onClick={() => void saveWelcome()}>
                            {startRule ? "Save welcome message" : "Add welcome message"}
                          </Button>
                          <button type="button" onClick={() => onOpen("builder")} className="text-xs text-[var(--primary)] hover:underline">
                            Add buttons and menus
                          </button>
                        </div>
                      </>
                    )}
                    {step.id === "commands" && (
                      <div className="flex flex-wrap gap-2">
                        {!step.done && (
                          <Button size="sm" loading={busy} disabled={!bot.hasToken} onClick={() => void addEssentials()}>
                            Add /start, /help and /settings
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => onOpen("commands")}>
                          Edit commands
                        </Button>
                      </div>
                    )}
                    {step.id === "listening" && (
                      <div className="flex flex-wrap items-center gap-3">
                        {bot.webhook?.url ? (
                          <>
                            <span className="text-xs text-[var(--danger)]">This bot has a webhook, which blocks monitoring.</span>
                            <Button size="sm" variant="outline" onClick={() => onOpen("delivery")}>
                              Open Delivery
                            </Button>
                          </>
                        ) : (
                          <label className="flex items-center gap-2">
                            <MonitorToggle bot={bot} onChange={onReload} />
                            <span>{bot.monitorEnabled ? "Listening" : "Not listening yet"}</span>
                          </label>
                        )}
                      </div>
                    )}
                    {step.id === "try" && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" asChild>
                          <a href={`https://t.me/${bot.username}`} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open @{bot.username}
                          </a>
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { writeFlag(triedKey, !tried); setTried(!tried); }}>
                          {tried ? "Mark as not done" : "I tried it"}
                        </Button>
                      </div>
                    )}
                  </div>
                  <StepPreview step={step.id} bot={bot} photoSrc={photoSrc} short={short} about={about} welcome={welcome} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function StepPreview({ step, bot, photoSrc, short, about, welcome }: { step: StepId; bot: BotDetail; photoSrc: string; short: string; about: string; welcome: string }) {
  const common = { botName: bot.name ?? bot.firstName, username: bot.username, photoSrc, className: "md:mx-0" };
  if (step === "photo" || step === "short" || step === "about") {
    return <TelegramPreview {...common} mode="profile" shortDescription={step === "short" ? short : bot.shortDescription ?? ""} description={step === "about" ? about : bot.description ?? ""} />;
  }
  if (step === "welcome") {
    return <TelegramPreview {...common} mode="chat" commands={bot.commands} messages={[{ from: "user", text: "/start" }, { from: "bot", text: welcome }]} />;
  }
  if (step === "commands") {
    return <TelegramPreview {...common} mode="chat" commands={bot.commands?.length ? bot.commands : ESSENTIAL_COMMANDS} showCommands messages={[{ from: "user", text: "/" }]} />;
  }
  return null;
}
