"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import { validatePoll } from "@/lib/validation";

const MAX_OPTIONS = 10;

/** Compose and send a poll or quiz to the open chat. */
export function PollDialog({ botId, chatId, open, onClose, onSent }: { botId: number; chatId: string; open: boolean; onClose: () => void; onSent: () => void }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [allowsMultiple, setAllowsMultiple] = useState(false);
  const [isQuiz, setIsQuiz] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [explanation, setExplanation] = useState("");
  const [sending, setSending] = useState(false);

  const filled = options.map((o) => o.trim()).filter(Boolean);
  // The correct answer is an index into the options that are actually sent (blank rows are dropped).
  const correctIndex = isQuiz ? Math.min(correct, filled.length - 1) : undefined;
  const quiz = isQuiz ? { correctIndex: correctIndex ?? 0, explanation: explanation.trim() || undefined } : undefined;
  const error = question || filled.length ? validatePoll({ question, options: filled, allowsMultiple, quiz }) : null;
  const canSend = Boolean(question.trim()) && !error && !sending;

  async function send() {
    setSending(true);
    try {
      await apiFetch(`/api/bots/${botId}/messages/poll`, {
        body: { chatId, question, options: filled, isAnonymous, allowsMultiple: isQuiz ? false : allowsMultiple, quiz },
      });
      toast.success(isQuiz ? "Quiz sent." : "Poll sent.");
      setQuestion("");
      setOptions(["", ""]);
      setExplanation("");
      onSent();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send the poll.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogTitle>Send a poll</DialogTitle>
        <DialogDescription>Telegram applies its own rules per chat, for example channel polls must be anonymous.</DialogDescription>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          <Input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} placeholder="Question" aria-label="Question" />
          <div className="space-y-1.5">
            {options.map((option, i) => (
              <div key={i} className="flex items-center gap-1.5">
                {isQuiz && (
                  <input type="radio" name="poll-correct" checked={correct === i} onChange={() => setCorrect(i)} aria-label={`Option ${i + 1} is correct`} />
                )}
                <Input
                  value={option}
                  onChange={(e) => setOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))}
                  maxLength={100}
                  placeholder={`Option ${i + 1}`}
                  aria-label={`Option ${i + 1}`}
                  className="h-9"
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      setOptions((prev) => prev.filter((_, j) => j !== i));
                      setCorrect(0);
                    }}
                    aria-label="Remove option"
                    className="text-[var(--muted)] hover:text-[var(--danger)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" disabled={options.length >= MAX_OPTIONS} onClick={() => setOptions((prev) => [...prev, ""])}>
              <Plus className="h-3.5 w-3.5" />
              Add option
            </Button>
          </div>
          <div className="space-y-1.5 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} />
              Anonymous votes
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isQuiz} onChange={(e) => setIsQuiz(e.target.checked)} />
              Quiz (one correct answer, pick it with the radio button)
            </label>
            {!isQuiz && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={allowsMultiple} onChange={(e) => setAllowsMultiple(e.target.checked)} />
                Allow several answers
              </label>
            )}
          </div>
          {isQuiz && <Input value={explanation} onChange={(e) => setExplanation(e.target.value)} maxLength={200} placeholder="Explanation shown after answering (optional)" aria-label="Explanation" />}
          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
        </div>
        <Button onClick={send} loading={sending} disabled={!canSend}>
          Send
        </Button>
      </DialogContent>
    </Dialog>
  );
}
