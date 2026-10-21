"use client";

import { ArrowLeft, ChevronRight, ExternalLink, Info, LayoutGrid, Columns3, Play, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-client";
import { buttonIdFrom } from "@/lib/button-id";
import { entryRules, flowButtons, isCallbackMatch, newStepId, pointingAt, unusedReplies, type FlowButton } from "@/lib/flow";
import { previewOf } from "./rule-preview";
import { FlowMap } from "./flow-map";
import { TestChat } from "./test-chat";
import { newButtonUid } from "./buttons-editor";
import { draftCanSave, draftError, draftToBody, emptyRuleDraft, isToastOnly, ruleToDraft, type RuleDraft } from "./rule-draft";
import { RuleFields } from "./rule-fields";
import type { SectionId } from "./sections";
import { TelegramPreview } from "./telegram-preview";
import type { AutoReplyRule, BotDetail } from "./types";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const firstLine = (s: string) => s.split("\n")[0];

/** What starts (or reaches) a step, in plain words. `via` is the text of the button that leads here. */
function triggerTitle(r: AutoReplyRule, via?: string): string {
  switch (r.matchType) {
    case "command":
      return `/${r.pattern}`;
    case "exact":
      return `Writes “${r.pattern}”`;
    case "contains":
      return `Mentions “${r.pattern}”`;
    case "starts_with":
      return `Starts with “${r.pattern}”`;
    case "regex":
      return `Matches pattern ${r.pattern}`;
    case "member_joined":
      return "Someone joins a group";
    case "reaction":
      return r.pattern === "*" ? "Reacts to a message" : `Reacts ${r.pattern}`;
    case "deeplink":
      return `Opens link code ${r.pattern}`;
    case "media":
      return `Sends ${r.pattern.replace("_", " ")}`;
    case "shared":
      return `Shares (request ${r.pattern})`;
    case "fallback":
      return "Anything else";
    default:
      return via ? `Presses “${via}”` : `Button “${r.pattern}”`;
  }
}

/**
 * The bot's replies as a conversation you can walk through: pick a starting point, click a button to see what it
 * leads to, and edit any step with a live preview. It only reads and writes ordinary auto-reply rules, so everything
 * here also shows up in "All rules".
 */
export function BuilderSection({ bot, photoSrc, onOpen }: { bot: BotDetail; photoSrc: string; onOpen: (section: SectionId) => void }) {
  const [rules, setRules] = useState<AutoReplyRule[] | null>(null);
  /** Rule IDs from a starting point down; the last one is the step being edited. */
  const [path, setPath] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<RuleDraft>(emptyRuleDraft);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [opens, setOpens] = useState("new");
  const [view, setView] = useState<"columns" | "map">("columns");
  const [testing, setTesting] = useState(false);

  const load = useCallback(async (): Promise<AutoReplyRule[]> => {
    try {
      const list = (await apiFetch<{ rules: AutoReplyRule[] }>(`/api/bots/${bot.id}/auto-replies`)).rules;
      setRules(list);
      return list;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load the replies.");
      setRules([]);
      return [];
    }
  }, [bot.id]);

  useEffect(() => {
    // Intentional: fetch-on-mount into local state, not state synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const all = rules ?? [];
  const byId = (id: number) => all.find((r) => r.id === id);
  const selected = path.length ? byId(path[path.length - 1]) : undefined;
  // The "anything else" rule is the last resort, so it sits last in the list too.
  const entries = [...entryRules(all).filter((r) => r.matchType !== "fallback"), ...entryRules(all).filter((r) => r.matchType === "fallback")];
  const unused = unusedReplies(all);
  const listening = bot.monitorEnabled && !bot.webhook?.url;

  function pick(nextPath: number[], list: AutoReplyRule[] = all) {
    setPath(nextPath);
    setCreating(false);
    setConfirmDelete(false);
    setOpens("new");
    setNewLabel("");
    const rule = list.find((r) => r.id === nextPath[nextPath.length - 1]);
    if (rule) setDraft(ruleToDraft(rule));
  }

  function startNew() {
    setPath([]);
    setCreating(true);
    setConfirmDelete(false);
    setDraft(emptyRuleDraft());
  }

  async function run(job: () => Promise<void>) {
    setBusy(true);
    try {
      await job();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const post = (body: Record<string, unknown>) => apiFetch<{ rule: AutoReplyRule }>(`/api/bots/${bot.id}/auto-replies`, { body: { enabled: true, ...body } });
  const newStepBody = (pattern: string, replyText: string, extra: Record<string, unknown> = {}) => ({
    matchType: "callback",
    pattern,
    replyText,
    parseMode: null,
    buttons: null,
    replyKeyboard: null,
    showAlert: false,
    callbackAction: "edit",
    ...extra,
  });

  const save = () =>
    run(async () => {
      if (creating) {
        const { rule } = await post(draftToBody(draft));
        toast.success("Added.");
        pick([rule.id], await load());
      } else if (selected) {
        await apiFetch(`/api/bots/${bot.id}/auto-replies/${selected.id}`, { method: "PATCH", body: draftToBody(draft) });
        toast.success("Saved.");
        pick(path, await load());
      }
    });

  const remove = () =>
    run(async () => {
      if (!selected) return;
      await apiFetch(`/api/bots/${bot.id}/auto-replies/${selected.id}`, { method: "DELETE" });
      toast.success("Deleted.");
      const list = await load();
      pick(path.slice(0, -1), list);
    });

  /** A button with no reply behind it: create the reply it should lead to, then open it. */
  const createForUnlinked = (at: number, button: FlowButton) =>
    run(async () => {
      if (!button.data) return;
      const { rule } = await post(newStepBody(button.data, `Write the reply for “${button.text}” here.`));
      pick([...path.slice(0, at + 1), rule.id], await load());
    });

  const addButton = () =>
    run(async () => {
      if (!selected) return;
      const label = newLabel.trim();
      if (!label) return;
      const problem = draftError(draft);
      if (problem) {
        toast.error(`Fix this first: ${problem}`);
        return;
      }
      // Reply first, then the button that points at it: if the second write fails, the leftover is an unused reply
      // (listed in the first column), never a button that does nothing.
      let data: string;
      let created: AutoReplyRule | undefined;
      if (opens === "new") {
        data = newStepId(selected.pattern, label, all, buttonIdFrom);
        created = (await post(newStepBody(data, `Write the reply for “${label}” here.`))).rule;
      } else if (opens === "back-copy") {
        const entry = byId(path[0]);
        if (!entry) return;
        data = newStepId(entry.pattern, "home", all, buttonIdFrom);
        // Entry points can't be the target of a button, so Back leads to a copy of the start message that edits in place.
        created = (await post(newStepBody(data, entry.replyText, { parseMode: entry.parseMode, buttons: entry.buttons }))).rule;
      } else {
        const target = byId(Number(opens.replace("rule:", "")));
        if (!target) return;
        data = target.pattern;
      }
      const next: RuleDraft = { ...draft, buttons: [...draft.buttons, { text: label, kind: "callback", value: data, style: "", sameRow: false, uid: newButtonUid() }] };
      try {
        await apiFetch(`/api/bots/${bot.id}/auto-replies/${selected.id}`, { method: "PATCH", body: draftToBody(next) });
      } catch (err) {
        await load();
        toast.error(`${err instanceof Error ? err.message : "Couldn't add the button."}${created ? " The new reply was kept under “Unused replies”." : ""}`);
        return;
      }
      toast.success("Button added.");
      const list = await load();
      pick(created && opens === "new" ? [...path, created.id] : path, list);
    });

  if (rules === null) return <Skeleton className="h-64" />;

  if (all.length === 0 && !creating) {
    return (
      <Card className="mx-auto flex max-w-xl flex-col items-center gap-3 py-10 text-center">
        <h2 className="text-base font-semibold">Your bot has no replies yet</h2>
        <p className="text-sm text-[var(--muted)]">Replies are what the bot says when someone writes to it or presses a button. Start from a ready-made bot, or write the first one yourself.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => onOpen("templates")}>Start from a template</Button>
          <Button variant="outline" onClick={startNew}>
            Write the first reply
          </Button>
        </div>
      </Card>
    );
  }

  const parentOfSelected = path.length >= 2 ? byId(path[path.length - 2]) : undefined;
  const referrers = selected ? pointingAt(selected, all) : [];
  const canHoldButtons = Boolean(selected) && !isToastOnly(draft);
  const preview = previewOf(draft, bot.id);
  const hasUnsavedChanges = Boolean(selected) && JSON.stringify(draftToBody(draft)) !== JSON.stringify(draftToBody(ruleToDraft(selected!)));

  return (
    <div className="space-y-4">
      {!listening && (
        <Card className="flex items-start gap-2 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden />
          <p>Replies only run while monitoring is on and no webhook is set. {bot.webhook?.url ? "This bot has a webhook." : "Turn it on with the switch in the header."}</p>
        </Card>
      )}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
        <Card className="min-w-0">
          <CardHeader className="flex-wrap gap-2">
            <div>
              <CardTitle>How the conversation flows</CardTitle>
              <p className="text-xs text-[var(--muted)]">Pick where a conversation starts, then click a button to follow it. Click any box to edit it.</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <div className="flex rounded-lg border border-[var(--card-border)] p-0.5" role="group" aria-label="View">
                <Button type="button" size="sm" variant={view === "columns" ? "default" : "ghost"} aria-pressed={view === "columns"} onClick={() => setView("columns")}>
                  <Columns3 className="h-3.5 w-3.5" />
                  Columns
                </Button>
                <Button type="button" size="sm" variant={view === "map" ? "default" : "ghost"} aria-pressed={view === "map"} onClick={() => setView("map")}>
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Map
                </Button>
              </div>
              <Button type="button" size="sm" variant={testing ? "default" : "outline"} aria-pressed={testing} onClick={() => setTesting((v) => !v)}>
                <Play className="h-3.5 w-3.5" />
                Try it
              </Button>
            </div>
          </CardHeader>
          {view === "map" ? (
            <FlowMap
              rules={all}
              selectedId={selected?.id}
              title={(r) => triggerTitle(r)}
              onPick={(p) => {
                pick(p);
                setTesting(false);
                setView("columns");
              }}
            />
          ) : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            <div className="w-60 shrink-0 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Starts when…</p>
              {entries.map((r) => (
                <StepBox key={r.id} title={triggerTitle(r)} text={r.replyText} disabled={!r.enabled} active={path[0] === r.id} onClick={() => pick([r.id])} />
              ))}
              <Button variant="outline" size="sm" className="w-full" onClick={startNew}>
                <Plus className="h-3.5 w-3.5" />
                New starting point
              </Button>
              {unused.length > 0 && (
                <div className="space-y-2 pt-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Unused replies</p>
                  <p className="text-xs text-[var(--muted)]">No button leads to these.</p>
                  {unused.map((r) => (
                    <StepBox key={r.id} title={triggerTitle(r)} text={r.replyText} disabled={!r.enabled} active={path[0] === r.id} onClick={() => pick([r.id])} />
                  ))}
                </div>
              )}
            </div>
            {path.map((id, i) => {
              const rule = byId(id);
              if (!rule) return null;
              const before = i > 0 ? byId(path[i - 1]) : undefined;
              const via = before ? flowButtons(before, all, []).flat().find((b) => b.target?.id === id)?.text : undefined;
              return (
                <div key={`${id}-${i}`} className="w-64 shrink-0 space-y-2">
                  <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                    <ChevronRight className="h-3 w-3" aria-hidden />
                    {i === 0 ? "Then the bot says" : "Which leads to"}
                  </p>
                  <StepBox
                    title={triggerTitle(rule, via)}
                    text={rule.replyText}
                    note={isCallbackMatch(rule) && rule.callbackAction === "edit" ? "Replaces the message" : isCallbackMatch(rule) && rule.callbackAction === "toast" ? "Small pop-up" : undefined}
                    disabled={!rule.enabled}
                    active={i === path.length - 1}
                    onClick={() => pick(path.slice(0, i + 1))}
                  >
                    <ButtonRows
                      rows={flowButtons(rule, all, path.slice(0, i + 1))}
                      nextId={path[i + 1]}
                      onStep={(b) => pick([...path.slice(0, i + 1), b.target!.id])}
                      onLoop={(b) => pick(path.slice(0, path.indexOf(b.target!.id) + 1))}
                      onUnlinked={(b) => void createForUnlinked(i, b)}
                    />
                  </StepBox>
                </div>
              );
            })}
          </div>
          )}
        </Card>

        {testing ? (
          <div className="xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto">
            <TestChat bot={bot} photoSrc={photoSrc} rules={all} unsaved={hasUnsavedChanges} onClose={() => setTesting(false)} />
          </div>
        ) : (
        <Card className="xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto">
          {!creating && !selected ? (
            <div className="space-y-2 py-6 text-center text-sm text-[var(--muted)]">
              <p>Pick a starting point on the left to see and edit its reply.</p>
            </div>
          ) : (
            <>
              <CardHeader>
                <CardTitle>{creating ? "New starting point" : "Edit this reply"}</CardTitle>
              </CardHeader>
              <div className="mb-4">
                <TelegramPreview
                  mode="chat"
                  botName={bot.name ?? bot.firstName}
                  username={bot.username}
                  photoSrc={photoSrc}
                  commands={bot.commands}
                  messages={preview.messages}
                  keyboard={preview.keyboard}
                />
              </div>
              <div className="space-y-3">
                <RuleFields bot={bot} draft={draft} onChange={setDraft} idPrefix="builder" />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void save()} loading={busy} disabled={!draftCanSave(draft) || busy}>
                    {creating ? "Add" : "Save changes"}
                  </Button>
                  {!creating && selected && !confirmDelete && (
                    <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  )}
                </div>
                {confirmDelete && selected && (
                  <div className="space-y-2 rounded-lg border border-[var(--danger)] p-3 text-sm">
                    <p>
                      Delete this reply?
                      {referrers.length > 0 && (
                        <>
                          {" "}
                          Buttons in {referrers.map((r) => `“${clip(triggerTitle(r), 24)}”`).join(", ")} lead here and will stop doing anything.
                        </>
                      )}
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="danger" onClick={() => void remove()} loading={busy}>
                        Delete
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                        Keep it
                      </Button>
                    </div>
                  </div>
                )}

                {canHoldButtons && (
                  <div className="space-y-2 border-t border-[var(--card-border)] pt-3">
                    <p className="text-sm font-medium">Add a button under this reply</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Button text, e.g. Prices" maxLength={64} aria-label="New button text" className="min-w-0 flex-1" />
                      <select
                        value={opens}
                        onChange={(e) => setOpens(e.target.value)}
                        aria-label="What the button opens"
                        className="h-10 max-w-[200px] rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-2 text-sm"
                      >
                        <option value="new">Opens a new reply</option>
                        {path.length >= 2 && entries.some((e) => e.id === path[0]) && <option value="back-copy">Goes back to the start message</option>}
                        {all
                          .filter((r) => r.matchType === "callback" && r.id !== selected?.id)
                          .map((r) => (
                            <option key={r.id} value={`rule:${r.id}`}>
                              Opens: {clip(firstLine(r.replyText), 28)}
                            </option>
                          ))}
                      </select>
                      <Button size="sm" onClick={() => void addButton()} disabled={!newLabel.trim() || busy} loading={busy}>
                        Add button
                      </Button>
                    </div>
                    {parentOfSelected && (
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs text-[var(--primary)] hover:underline"
                        onClick={() => {
                          setNewLabel("⬅️ Back");
                          setOpens(isCallbackMatch(parentOfSelected) ? `rule:${parentOfSelected.id}` : "back-copy");
                        }}
                      >
                        <ArrowLeft className="h-3 w-3" aria-hidden />
                        Fill in a Back button
                      </button>
                    )}
                    <p className="text-xs text-[var(--muted)]">Saves your changes above too. The new reply starts with placeholder text for you to write.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </Card>
        )}
      </div>
    </div>
  );
}

/** One box in the flow: what triggers it and the start of what the bot says, with its buttons as children. */
function StepBox({
  title,
  text,
  note,
  disabled,
  active,
  onClick,
  children,
}: {
  title: string;
  text: string;
  note?: string;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border bg-[var(--card)] ${active ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/30" : "border-[var(--card-border)]"} ${disabled ? "opacity-60" : ""}`}>
      <button type="button" onClick={onClick} className="block w-full rounded-t-xl p-3 text-left hover:bg-black/5 dark:hover:bg-white/5">
        <span className="block truncate text-xs font-semibold text-[var(--primary)]">{title}</span>
        <span className="mt-1 line-clamp-3 block whitespace-pre-wrap break-words text-sm">{text}</span>
        {(note || disabled) && <span className="mt-1 block text-[11px] text-[var(--muted)]">{[note, disabled ? "Switched off" : null].filter(Boolean).join(" · ")}</span>}
      </button>
      {children}
    </div>
  );
}

function ButtonRows({
  rows,
  nextId,
  onStep,
  onLoop,
  onUnlinked,
}: {
  rows: FlowButton[][];
  nextId: number | undefined;
  onStep: (b: FlowButton) => void;
  onLoop: (b: FlowButton) => void;
  onUnlinked: (b: FlowButton) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1 border-t border-[var(--card-border)] p-2">
      {rows.map((row, r) => (
        <div key={r} className="flex gap-1">
          {row.map((b, c) => {
            const base = "flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1 text-xs";
            if (b.kind === "leaf")
              return (
                <span key={c} className={`${base} border-[var(--card-border)] text-[var(--muted)]`} title="Opens a link or something outside the conversation">
                  <span className="truncate">{b.text}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                </span>
              );
            if (b.kind === "unlinked")
              return (
                <button key={c} type="button" onClick={() => onUnlinked(b)} className={`${base} border-dashed border-amber-500 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400`} title="Nothing happens when this is pressed. Click to write the reply it should lead to.">
                  <span className="truncate">{b.text}</span>
                  <Plus className="h-3 w-3 shrink-0" aria-hidden />
                </button>
              );
            if (b.kind === "loop")
              return (
                <button key={c} type="button" onClick={() => onLoop(b)} className={`${base} border-[var(--card-border)] hover:bg-black/5 dark:hover:bg-white/5`} title="Goes back to a box you already passed">
                  <ArrowLeft className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="truncate">{b.text}</span>
                </button>
              );
            return (
              <button
                key={c}
                type="button"
                onClick={() => onStep(b)}
                className={`${base} ${b.target?.id === nextId ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]" : "border-[var(--card-border)] hover:bg-black/5 dark:hover:bg-white/5"}`}
              >
                <span className="truncate">{b.text}</span>
                <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
