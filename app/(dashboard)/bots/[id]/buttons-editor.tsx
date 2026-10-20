"use client";

import { GripVertical, Plus, X } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { buttonIdFrom } from "@/lib/button-id";
import { isPrivateChatId, type ButtonStyle, type InlineButton } from "@/lib/botapi";
import { validateInlineButtons } from "@/lib/validation";

export type ButtonKind = "url" | "callback" | "copy" | "web_app" | "inline" | "inline_here" | "login" | "chosen_chat";

export type ChatKind = "user" | "bot" | "group" | "channel";
const CHAT_KINDS: ChatKind[] = ["user", "bot", "group", "channel"];

/** One button being edited. `value` is the link, callback data, text to copy, Mini App URL or inline query. */
export interface ButtonDraft {
  text: string;
  kind: ButtonKind;
  value: string;
  style: ButtonStyle | "";
  /** Put this button in the same row as the one before it (otherwise it starts a new row). */
  sameRow: boolean;
  /** `chosen_chat` buttons: which kinds of chat the user may pick. */
  allow?: ChatKind[];
  /** `login` buttons: ask for permission to message the user. */
  writeAccess?: boolean;
  /**
   * `callback` buttons created in this editor: the ID follows the label until the user edits the ID. Never set on
   * buttons loaded from a saved rule, so renaming a saved button can't silently change (and so unlink) its ID.
   */
  idAuto?: boolean;
  /** A stable identity for dragging the row (the list is otherwise keyed by position). Never sent anywhere. */
  uid?: string;
}

let uidCounter = 0;
export const newButtonUid = () => `btn-${++uidCounter}`;

export const emptyButtonDraft = (): ButtonDraft => ({ text: "", kind: "url", value: "", style: "", sameRow: false, uid: newButtonUid() });

const MAX_DRAFTS = 8;
const MAX_PER_ROW = 4;

const KIND_LABELS: Record<ButtonKind, string> = {
  url: "Opens a link",
  callback: "Triggers a reply",
  copy: "Copies text",
  web_app: "Opens a Mini App",
  inline: "Inline query (pick chat)",
  inline_here: "Inline query (this chat)",
  login: "Telegram Login",
  chosen_chat: "Inline query (choose chat type)",
};

const PLACEHOLDERS: Record<ButtonKind, string> = {
  url: "https://…",
  callback: "Button ID (hidden), e.g. about",
  copy: "text copied to the clipboard",
  web_app: "https://… (Mini App)",
  inline: "inline query (may be empty)",
  inline_here: "inline query (may be empty)",
  login: "https://… (host = bot's login domain)",
  chosen_chat: "inline query (may be empty)",
};

const STYLE_COLORS: Record<ButtonStyle | "", string> = {
  "": "var(--muted)",
  primary: "#2563eb",
  success: "#16a34a",
  danger: "#dc2626",
};

function isFilled(b: ButtonDraft) {
  // An inline-query button is valid with an empty query, so the text alone makes it "filled".
  return Boolean(b.text.trim() || b.value.trim());
}

function toButton(b: ButtonDraft): InlineButton {
  const base: InlineButton = { text: b.text.trim() };
  if (b.style) base.style = b.style;
  const value = b.kind === "inline" || b.kind === "inline_here" || b.kind === "chosen_chat" ? b.value : b.value.trim();
  switch (b.kind) {
    case "url":
      return { ...base, url: value };
    case "callback":
      return { ...base, callback_data: value };
    case "copy":
      return { ...base, copy_text: { text: value } };
    case "web_app":
      return { ...base, web_app: { url: value } };
    case "inline":
      return { ...base, switch_inline_query: value };
    case "inline_here":
      return { ...base, switch_inline_query_current_chat: value };
    case "login":
      return { ...base, login_url: { url: value, ...(b.writeAccess ? { request_write_access: true } : {}) } };
    case "chosen_chat": {
      const allow = b.allow ?? [];
      return {
        ...base,
        switch_inline_query_chosen_chat: {
          ...(value ? { query: value } : {}),
          ...(allow.includes("user") ? { allow_user_chats: true } : {}),
          ...(allow.includes("bot") ? { allow_bot_chats: true } : {}),
          ...(allow.includes("group") ? { allow_group_chats: true } : {}),
          ...(allow.includes("channel") ? { allow_channel_chats: true } : {}),
        },
      };
    }
  }
}

/** The filled drafts as message buttons, grouped into rows by `sameRow` (undefined when there are none). */
export function draftsToButtons(drafts: ButtonDraft[]): InlineButton[][] | undefined {
  const rows: InlineButton[][] = [];
  for (const draft of drafts.filter(isFilled)) {
    const last = rows[rows.length - 1];
    if (draft.sameRow && last && last.length < MAX_PER_ROW) last.push(toButton(draft));
    else rows.push([toButton(draft)]);
  }
  return rows.length ? rows : undefined;
}

/** Stored buttons back into editable drafts, keeping the row layout (`sameRow` on every button after a row's first). */
export function buttonsToDrafts(buttons: InlineButton[][] | null | undefined): ButtonDraft[] {
  return (buttons ?? []).flatMap((row) =>
    row.map((b, i): ButtonDraft => {
      const common = { text: b.text, style: b.style ?? "", sameRow: i > 0, uid: newButtonUid() } as const;
      if (b.copy_text) return { ...common, kind: "copy", value: b.copy_text.text };
      if (b.web_app) return { ...common, kind: "web_app", value: b.web_app.url };
      if (b.login_url) return { ...common, kind: "login", value: b.login_url.url, writeAccess: b.login_url.request_write_access === true };
      if (b.switch_inline_query_chosen_chat) {
        const c = b.switch_inline_query_chosen_chat;
        const allow = CHAT_KINDS.filter((k) => c[`allow_${k}_chats` as const]);
        return { ...common, kind: "chosen_chat", value: c.query ?? "", allow };
      }
      if (b.switch_inline_query !== undefined) return { ...common, kind: "inline", value: b.switch_inline_query };
      if (b.switch_inline_query_current_chat !== undefined) return { ...common, kind: "inline_here", value: b.switch_inline_query_current_chat };
      if (b.callback_data !== undefined) return { ...common, kind: "callback", value: b.callback_data };
      return { ...common, kind: "url", value: b.url ?? "" };
    })
  );
}

/** Validation message for the drafts. `chatId` (when the destination is known) lets it reject Mini App buttons in groups. */
export function draftsError(drafts: ButtonDraft[], chatId?: string): string | null {
  const buttons = draftsToButtons(drafts);
  return buttons ? validateInlineButtons(buttons, chatId) : null;
}

const field = "h-8 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-2 text-xs";

interface ButtonTemplate {
  id: number;
  name: string;
  buttons: InlineButton[][];
}

/** Load a saved keyboard layout into the editor, or save the current one under a name. */
function TemplatesBar({ botId, drafts, onChange }: { botId: number; drafts: ButtonDraft[]; onChange: (drafts: ButtonDraft[]) => void }) {
  const [templates, setTemplates] = useState<ButtonTemplate[]>([]);
  const [selected, setSelected] = useState("");
  const current = draftsToButtons(drafts);

  const load = useCallback(async () => {
    try {
      setTemplates((await apiFetch<{ templates: ButtonTemplate[] }>(`/api/bots/${botId}/button-templates`)).templates);
    } catch {
      // Templates are a convenience: the editor works without them.
    }
  }, [botId]);

  useEffect(() => {
    // Intentional: fetch-on-mount into local state, not state synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function save() {
    const name = window.prompt("Name for this button layout:")?.trim();
    if (!name || !current) return;
    try {
      await apiFetch(`/api/bots/${botId}/button-templates`, { body: { name, buttons: current } });
      toast.success("Template saved.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save the template.");
    }
  }

  async function remove() {
    if (!selected) return;
    try {
      await apiFetch(`/api/bots/${botId}/button-templates/${selected}`, { method: "DELETE" });
      setSelected("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete the template.");
    }
  }

  if (!templates.length && !current) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {templates.length > 0 && (
        <>
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              const t = templates.find((x) => String(x.id) === e.target.value);
              if (t) onChange(buttonsToDrafts(t.buttons));
            }}
            aria-label="Saved button layouts"
            className={field}
          >
            <option value="">Load a saved layout…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {selected && (
            <Button type="button" variant="ghost" size="sm" onClick={() => void remove()}>
              Delete layout
            </Button>
          )}
        </>
      )}
      {current && !draftsError(drafts) && (
        <Button type="button" variant="ghost" size="sm" onClick={() => void save()}>
          Save as layout
        </Button>
      )}
    </div>
  );
}

/** One editable button row that can be dragged by its grip, or moved with the arrow keys while the grip is focused. */
function DraggableRow({ value, onMove, children }: { value: ButtonDraft; onMove: (by: -1 | 1) => void; children: ReactNode }) {
  const controls = useDragControls();
  return (
    <Reorder.Item value={value} as="div" dragListener={false} dragControls={controls} className="flex items-start gap-1">
      <button
        type="button"
        onPointerDown={(e) => controls.start(e)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            onMove(e.key === "ArrowUp" ? -1 : 1);
          }
        }}
        aria-label="Move button (drag, or use the arrow keys)"
        title="Drag to reorder"
        className="mt-1.5 shrink-0 cursor-grab touch-none text-[var(--muted)] hover:text-[var(--foreground)] active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5 sm:flex-nowrap">{children}</div>
    </Reorder.Item>
  );
}

export function ButtonsEditor({
  drafts,
  onChange,
  allowCallback = true,
  chatId,
  inlineMode,
  business = false,
  botId,
}: {
  drafts: ButtonDraft[];
  onChange: (drafts: ButtonDraft[]) => void;
  allowCallback?: boolean;
  /** The destination chat when known: Mini App buttons are only offered for private chats. Omit when it varies (auto-replies). */
  chatId?: string;
  /** Whether the bot has inline mode on (`supports_inline_queries`); undefined = unknown. */
  inlineMode?: boolean;
  /** A Telegram Business chat: Mini App and inline-query buttons are not supported there. */
  business?: boolean;
  /** When given, saved button layouts (templates) of this bot can be loaded and saved. */
  botId?: number;
}) {
  const error = draftsError(drafts, chatId);
  const allowWebApp = chatId === undefined || isPrivateChatId(chatId);
  const kinds = (Object.keys(KIND_LABELS) as ButtonKind[]).filter(
    (k) =>
      (allowCallback || k !== "callback") && (allowWebApp || k !== "web_app") && !(business && (k === "web_app" || k === "inline" || k === "inline_here" || k === "chosen_chat" || k === "login"))
  );
  const update = (i: number, patch: Partial<ButtonDraft>) => onChange(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  // The first button always starts a row, whatever its flag says, so a moved button can't carry a stale "same row".
  const normalize = (list: ButtonDraft[]) => list.map((d, j) => (j === 0 && d.sameRow ? { ...d, sameRow: false } : d));
  const reorder = (next: ButtonDraft[]) => onChange(normalize(next));
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= drafts.length) return;
    const next = drafts.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(normalize(next));
  };
  const usesInline = drafts.some((d) => (d.kind === "inline" || d.kind === "inline_here" || d.kind === "chosen_chat") && isFilled(d));

  return (
    <div className="space-y-1.5">
      {botId !== undefined && <TemplatesBar botId={botId} drafts={drafts} onChange={onChange} />}
      <Reorder.Group axis="y" values={drafts} onReorder={reorder} as="div" className="space-y-1.5">
      {drafts.map((b, i) => (
        <DraggableRow key={b.uid ?? i} value={b} onMove={(by) => move(i, by)}>
          {i > 0 && (
            <button
              type="button"
              onClick={() => update(i, { sameRow: !b.sameRow })}
              aria-pressed={b.sameRow}
              title={b.sameRow ? "Same row as the button above" : "Starts a new row"}
              className={`${field} w-8 shrink-0 text-center ${b.sameRow ? "bg-[var(--primary)] text-white" : "text-[var(--muted)]"}`}
            >
              {b.sameRow ? "↔" : "↓"}
            </button>
          )}
          <input
            value={b.text}
            onChange={(e) => update(i, b.kind === "callback" && b.idAuto ? { text: e.target.value, value: buttonIdFrom(e.target.value) } : { text: e.target.value })}
            placeholder="Button text"
            maxLength={64}
            aria-label="Button text"
            className={`${field} w-32`}
          />
          <select
            value={b.kind}
            onChange={(e) => {
              const kind = e.target.value as ButtonKind;
              update(i, kind === "callback" ? { kind, value: buttonIdFrom(b.text), idAuto: true } : { kind, value: "", idAuto: false });
            }}
            aria-label="Button type"
            className={field}
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <input
            value={b.value}
            onChange={(e) => update(i, { value: e.target.value, idAuto: false })}
            placeholder={PLACEHOLDERS[b.kind]}
            title={b.kind === "callback" ? "A hidden ID that links this button to a \u201cSomeone presses a button\u201d rule. It is never shown to people." : undefined}
            aria-label={KIND_LABELS[b.kind]}
            className={`${field} min-w-0 flex-1`}
          />
          {b.kind === "chosen_chat" && (
            <span className="flex items-center gap-1.5 text-xs" aria-label="Chats the user may choose">
              {CHAT_KINDS.map((k) => (
                <label key={k} className="flex items-center gap-0.5">
                  <input
                    type="checkbox"
                    checked={b.allow?.includes(k) ?? false}
                    onChange={(e) => update(i, { allow: e.target.checked ? [...(b.allow ?? []), k] : (b.allow ?? []).filter((x) => x !== k) })}
                  />
                  {k}
                </label>
              ))}
            </span>
          )}
          {b.kind === "login" && (
            <label className="flex items-center gap-1 text-xs" title="Ask the user to let the bot message them">
              <input type="checkbox" checked={b.writeAccess ?? false} onChange={(e) => update(i, { writeAccess: e.target.checked })} />
              write access
            </label>
          )}
          <select
            value={b.style}
            onChange={(e) => update(i, { style: e.target.value as ButtonDraft["style"] })}
            aria-label="Button colour"
            style={{ color: STYLE_COLORS[b.style] }}
            className={field}
          >
            <option value="">Default</option>
            <option value="primary">Blue</option>
            <option value="success">Green</option>
            <option value="danger">Red</option>
          </select>
          <button
            type="button"
            onClick={() => onChange(drafts.filter((_, j) => j !== i))}
            aria-label="Remove button"
            className="text-[var(--muted)] hover:text-[var(--danger)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </DraggableRow>
      ))}
      </Reorder.Group>
      <Button type="button" variant="ghost" size="sm" disabled={drafts.length >= MAX_DRAFTS} onClick={() => onChange([...drafts, emptyButtonDraft()])}>
        <Plus className="h-3.5 w-3.5" />
        Add button
      </Button>
      {drafts.some((d) => d.kind === "callback" && isFilled(d)) && (
        <p className="text-xs text-[var(--muted)]">
          Button presses are only noticed while monitoring is on. A button only does something once a &ldquo;Someone presses a button&rdquo; rule has the same ID (the Conversation builder creates it for you).
        </p>
      )}
      {usesInline && (
        <p className="text-xs text-[var(--muted)]">
          {inlineMode === false
            ? "Inline mode is off for this bot, so these buttons will do nothing. Turn it on in BotFather with /setinline."
            : "Inline-query buttons need inline mode on for this bot (BotFather: /setinline)."}
        </p>
      )}
      {drafts.some((d) => d.kind === "login" && isFilled(d)) && (
        <p className="text-xs text-[var(--muted)]">The link&rsquo;s domain must be set as the bot&rsquo;s login domain (Info → Capabilities → login domain), or Telegram rejects the message.</p>
      )}
      {chatId === undefined && drafts.some((d) => d.kind === "web_app" && isFilled(d)) && (
        <p className="text-xs text-[var(--muted)]">Mini App buttons only work in private chats; in a group the rule replies without them.</p>
      )}
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}
