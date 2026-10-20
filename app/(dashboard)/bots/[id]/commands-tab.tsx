"use client";

import { Plus, RotateCcw, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field-error";
import { apiFetch } from "@/lib/api-client";
import { CHAT_COMMAND_SCOPES, validateCommand, validateCommandDescription, validateCommandTarget } from "@/lib/validation";
import { spring } from "@/components/motion";
import { LanguageSelect } from "./language-select";
import type { BotCommand, BotDetail } from "./types";
import { ESSENTIAL_COMMANDS } from "./essential-commands";

// Stable per-row IDs so AnimatePresence can animate removal correctly (array index shifts on delete).
// A module-level counter (not a ref) since it's only ever read/written in event handlers, never during render.
let nextCommandKey = 0;

interface CommandRow extends BotCommand {
  key: number;
}

const SCOPES = [
  { value: "default", label: "Default (everywhere)" },
  { value: "all_private_chats", label: "All private chats" },
  { value: "all_group_chats", label: "All group chats" },
  { value: "all_chat_administrators", label: "All group admins" },
  { value: "chat", label: "One chat…" },
  { value: "chat_administrators", label: "Admins of one chat…" },
  { value: "chat_member", label: "One member of a chat…" },
];

const isChatScope = (scope: string) => (CHAT_COMMAND_SCOPES as readonly string[]).includes(scope);

/** Query string identifying one scope + language (+ chat/user for the per-chat scopes). */
function targetQuery(scope: string, lang: string, chatId: string, userId: string): string {
  const q = new URLSearchParams({ scope, lang });
  if (isChatScope(scope)) q.set("chatId", chatId.trim());
  if (scope === "chat_member") q.set("userId", userId.trim());
  return q.toString();
}

function toRows(commands: BotCommand[]): CommandRow[] {
  const initial = commands.length ? commands : [{ command: "", description: "" }];
  return initial.map((c) => ({ ...c, key: nextCommandKey++ }));
}

export function CommandsTab({ bot, onSaved }: { bot: BotDetail; onSaved: () => void }) {
  const [commands, setCommands] = useState<CommandRow[]>(() => toRows(bot.commands ?? []));
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState("default");
  const [lang, setLang] = useState("");
  // The chat/user the per-chat scopes point at: the inputs are what's typed, the committed values are what's loaded.
  const [chatInput, setChatInput] = useState("");
  const [userInput, setUserInput] = useState("");
  const [chatId, setChatId] = useState("");
  const [userId, setUserId] = useState("");
  const [knownChats, setKnownChats] = useState<{ chatId: string; title: string }[]>([]);
  const [loading, setLoading] = useState(false);
  // Ignores a slow response for a scope/language the user has already switched away from.
  const loadRequest = useRef(0);

  /** True when the scope needs a chat (and user) that hasn't been loaded yet. */
  const targetError = validateCommandTarget(scope, isChatScope(scope) ? chatId : undefined, scope === "chat_member" ? userId : undefined);

  async function loadTarget(nextScope: string, nextLang: string, nextChat = chatId, nextUser = userId) {
    const chatScope = isChatScope(nextScope);
    const chat = chatScope ? nextChat : "";
    const user = nextScope === "chat_member" ? nextUser : "";
    setScope(nextScope);
    setLang(nextLang);
    setChatId(chat);
    setUserId(user);
    if (!chatScope) {
      setChatInput("");
      setUserInput("");
    } else if (!knownChats.length) {
      // Best effort: the chats this bot is tracked in, to suggest in the picker.
      apiFetch<{ chats: { chatId: string; title: string }[] }>(`/api/bots/${bot.id}/chats`)
        .then((r) => setKnownChats(r.chats.map((c) => ({ chatId: c.chatId, title: c.title }))))
        .catch(() => {});
    }
    const request = ++loadRequest.current;
    if (validateCommandTarget(nextScope, chatScope ? chat : undefined, nextScope === "chat_member" ? user : undefined)) {
      // Nothing to load until a chat (and user) is picked; show an empty list.
      setCommands(toRows([]));
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { commands: loaded } = await apiFetch<{ commands: BotCommand[] }>(
        `/api/bots/${bot.id}/commands?${targetQuery(nextScope, nextLang, chat, user)}`
      );
      if (request === loadRequest.current) setCommands(toRows(loaded));
    } catch (err) {
      if (request === loadRequest.current) toast.error(err instanceof Error ? err.message : "Failed to load commands.");
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    try {
      await apiFetch(`/api/bots/${bot.id}/commands?${targetQuery(scope, lang, chatId, userId)}`, { method: "DELETE" });
      toast.success("Commands reset.");
      await loadTarget(scope, lang);
      if (scope === "default" && lang === "") onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset commands.");
    } finally {
      setSaving(false);
    }
  }

  function rowError(cmd: CommandRow): string | null {
    const command = cmd.command.trim().replace(/^\//, "");
    const description = cmd.description.trim();
    if (!command && !description) return null;
    return validateCommand(command) ?? validateCommandDescription(description);
  }

  const errors = commands.map(rowError);
  const hasErrors = errors.some(Boolean);

  function updateCommand(key: number, field: keyof BotCommand, value: string) {
    setCommands((prev) => prev.map((c) => (c.key === key ? { ...c, [field]: value } : c)));
  }

  function addRow() {
    setCommands((prev) => [...prev, { command: "", description: "", key: nextCommandKey++ }]);
  }

  /** Telegram's three global commands; only the ones the list doesn't have yet are added (still unsaved). */
  function addEssentials() {
    const essentials = ESSENTIAL_COMMANDS;
    setCommands((prev) => {
      const have = new Set(prev.map((c) => c.command.trim().toLowerCase()));
      const missing = essentials.filter((c) => !have.has(c.command));
      const kept = prev.filter((c) => c.command.trim() || c.description.trim());
      return [...kept, ...missing.map((c) => ({ ...c, key: nextCommandKey++ }))];
    });
  }

  function removeRow(key: number) {
    setCommands((prev) => prev.filter((c) => c.key !== key));
  }

  async function handleSave() {
    if (hasErrors) return;
    setSaving(true);
    try {
      const cleaned = commands
        .map((c) => ({ command: c.command.trim().replace(/^\//, ""), description: c.description.trim() }))
        .filter((c) => c.command && c.description);
      await apiFetch(`/api/bots/${bot.id}/commands`, {
        method: "PUT",
        body: { scope, languageCode: lang, commands: cleaned, ...(isChatScope(scope) ? { chatId: chatId.trim() } : {}), ...(scope === "chat_member" ? { userId: userId.trim() } : {}) },
      });
      toast.success("Commands saved.");
      if (scope === "default" && lang === "") onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save commands.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold">Commands menu</h3>
      <p className="mb-4 text-xs text-[var(--muted)]">
        Shown to users when they type &quot;/&quot; in chat with the bot. Telegram uses the most specific match: a scope plus the user&apos;s language, then the scope, then the default. Up to 32 bytes per command, 256 per description.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <select
          aria-label="Command scope"
          value={scope}
          onChange={(e) => loadTarget(e.target.value, lang)}
          className="h-9 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          {SCOPES.map((sc) => (
            <option key={sc.value} value={sc.value}>
              {sc.label}
            </option>
          ))}
        </select>
        <LanguageSelect value={lang} onChange={(code) => loadTarget(scope, code)} />
      </div>
      {isChatScope(scope) && (
        <div className="mb-4 space-y-1.5">
          <div className="flex flex-wrap gap-2">
            <Input
              list="command-chats"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Pick or type a chat ID"
              aria-label="Chat"
              className="min-w-0 flex-1"
            />
            <datalist id="command-chats">
              {knownChats.map((c) => (
                <option key={c.chatId} value={c.chatId}>
                  {c.title}
                </option>
              ))}
            </datalist>
            {scope === "chat_member" && (
              <Input value={userInput} onChange={(e) => setUserInput(e.target.value)} placeholder="User ID" aria-label="User ID" className="w-36" />
            )}
            <Button variant="outline" size="sm" onClick={() => loadTarget(scope, lang, chatInput, userInput)} disabled={loading}>
              Load
            </Button>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Overrides everything else for that chat{scope === "chat_member" ? " and member" : ""}. Telegram can&apos;t list which chats have overrides, so remember the ones you set; &quot;Reset this scope&quot; removes one.
          </p>
          {targetError && (chatId || userId) && <p className="text-xs text-[var(--danger)]">{targetError}</p>}
        </div>
      )}
      <div className={loading ? "pointer-events-none space-y-2 opacity-60" : "space-y-2"}>
        <AnimatePresence initial={false}>
          {commands.map((cmd, i) => (
            <motion.div
              key={cmd.key}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={spring}
              className="overflow-hidden"
            >
              <div className="flex gap-2 py-0.5">
                <Input
                  placeholder="start"
                  value={cmd.command}
                  onChange={(e) => updateCommand(cmd.key, "command", e.target.value)}
                  className="w-32 font-mono"
                  maxLength={32}
                />
                <Input
                  placeholder="Description"
                  value={cmd.description}
                  onChange={(e) => updateCommand(cmd.key, "description", e.target.value)}
                  className="flex-1"
                  maxLength={256}
                />
                <Button variant="ghost" size="icon" type="button" onClick={() => removeRow(cmd.key)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <FieldError error={errors[i]} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="h-3.5 w-3.5" />
          Add command
        </Button>
        <Button variant="outline" size="sm" onClick={addEssentials} title="Adds /start, /help and /settings if they're missing">
          Add essentials
        </Button>
        <Button size="sm" onClick={handleSave} loading={saving} disabled={hasErrors || loading || Boolean(targetError)}>
          Save commands
        </Button>
        {(scope !== "default" || lang !== "") && (
          <Button variant="ghost" size="sm" onClick={handleReset} disabled={saving || loading || Boolean(targetError)}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset this scope
          </Button>
        )}
      </div>
    </Card>
  );
}
