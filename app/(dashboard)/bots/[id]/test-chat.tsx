"use client";

import { Info, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { emptySim, simulatePress, simulateSend, type SimRule } from "@/lib/simulate";
import { TelegramPreview } from "./telegram-preview";
import type { AutoReplyRule, BotDetail } from "./types";

/** What someone might type to try the rules: each starting point's trigger, plus something no rule knows. */
function suggestions(rules: readonly AutoReplyRule[]): string[] {
  const out: string[] = [];
  for (const r of rules) {
    if (!r.enabled) continue;
    if (r.matchType === "command") out.push(`/${r.pattern}`);
    else if (r.matchType === "exact" || r.matchType === "contains") out.push(r.pattern);
    else if (r.matchType === "deeplink") out.push(`/start ${r.pattern}`);
  }
  if (rules.some((r) => r.enabled && r.matchType === "fallback")) out.push("something else");
  return [...new Set(out)].slice(0, 6);
}

/**
 * Click through the conversation like a customer would. It runs the bot's saved rules in the browser with the same
 * matchers the background poller uses, so nothing is sent to Telegram and nothing is counted.
 */
export function TestChat({
  bot,
  photoSrc,
  rules,
  unsaved,
  onClose,
}: {
  bot: BotDetail;
  photoSrc: string;
  rules: readonly AutoReplyRule[];
  /** The step being edited has changes that are not saved, so the test does not include them yet. */
  unsaved: boolean;
  onClose: () => void;
}) {
  const [sim, setSim] = useState(emptySim);
  const simRules: SimRule[] = rules.map((r) => ({
    enabled: r.enabled,
    matchType: r.matchType,
    pattern: r.pattern,
    replyText: r.replyText,
    parseMode: r.parseMode,
    buttons: r.buttons,
    replyKeyboard: r.replyKeyboard,
    callbackAction: r.callbackAction,
  }));
  const listening = bot.monitorEnabled && !bot.webhook?.url;
  const send = (text: string) => setSim((s) => simulateSend(s, simRules, bot.username, text));
  const chips = suggestions(rules);

  return (
    <Card>
      <CardHeader className="flex-wrap gap-2">
        <CardTitle>Try it</CardTitle>
        <div className="flex gap-1.5">
          <Button type="button" variant="ghost" size="sm" onClick={() => setSim(emptySim())}>
            <RotateCcw className="h-3.5 w-3.5" />
            Start over
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Back to editing
          </Button>
        </div>
      </CardHeader>
      <p className="mb-3 flex items-start gap-1.5 text-xs text-[var(--muted)]">
        <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
        <span>
          Type below or press the buttons, like a customer. This runs your saved replies here — nothing is sent to Telegram.
          {!listening && " The real bot only answers while monitoring is on."}
          {unsaved && " You have unsaved changes; save them to include them."}
        </span>
      </p>
      {chips.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <Button key={c} type="button" variant="outline" size="sm" onClick={() => send(c)}>
              {c}
            </Button>
          ))}
        </div>
      )}
      <TelegramPreview
        mode="chat"
        botName={bot.name ?? bot.firstName}
        username={bot.username}
        photoSrc={photoSrc}
        commands={bot.commands}
        messages={sim.messages}
        keyboard={sim.keyboard}
        onSend={send}
        onButtonPress={(index, button) => setSim((s) => simulatePress(s, simRules, index, button))}
      />
      {sim.messages.length === 0 && <p className="mt-3 text-center text-xs text-[var(--muted)]">Start with one of the suggestions above, or type your own message.</p>}
    </Card>
  );
}
