"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import type { Destination } from "@/lib/destinations";
import { validateChatId } from "@/lib/validation";

/** "3 people, 2 groups": what a list of chosen chat IDs contains (IDs the list doesn't know are told apart by sign). */
export function summarizeRecipients(ids: readonly string[], known: readonly Pick<Destination, "chatId" | "kind">[]): string {
  const kinds = new Map(known.map((d) => [d.chatId, d.kind]));
  const count = { user: 0, group: 0, channel: 0 };
  for (const id of ids) count[kinds.get(id) ?? (id.startsWith("-") ? "group" : "user")]++;
  const parts = [
    count.user && `${count.user} ${count.user === 1 ? "person" : "people"}`,
    count.group && `${count.group} ${count.group === 1 ? "group" : "groups"}`,
    count.channel && `${count.channel} ${count.channel === 1 ? "channel" : "channels"}`,
  ].filter(Boolean);
  return parts.join(", ") || "nobody";
}

const SECTIONS: { kind: Destination["kind"][]; title: string }[] = [
  { kind: ["user"], title: "People who wrote to this bot" },
  { kind: ["group", "channel"], title: "Groups and channels" },
];

/**
 * Multi-select list of the places a bot can send to, in a dialog (a rule's form column is too narrow to hold it).
 * Nothing changes until "Use these"; Escape or clicking outside keeps the previous choice. `allowManual` adds a field
 * for a chat ID the bot hasn't seen (scheduled messages only: a broadcast must stick to chats the server knows).
 */
export function RecipientPicker({
  botId,
  open,
  onOpenChange,
  selected,
  onApply,
  max,
  allowManual = false,
  title = "Choose recipients",
}: {
  botId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: string[];
  onApply: (ids: string[], known: Destination[]) => void;
  max: number;
  allowManual?: boolean;
  title?: string;
}) {
  const [destinations, setDestinations] = useState<Destination[] | null>(null);
  const [contactLimit, setContactLimit] = useState(0);
  const [chosen, setChosen] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (!open) return;
    // Intentional: (re)load the list and start from the current choice each time the dialog opens.
    /* eslint-disable react-hooks/set-state-in-effect */
    setChosen(selected);
    setSearch("");
    setManual("");
    /* eslint-enable react-hooks/set-state-in-effect */
    let cancelled = false;
    apiFetch<{ destinations: Destination[]; contactLimit: number }>(`/api/bots/${botId}/audience`)
      .then((r) => {
        if (cancelled) return;
        setDestinations(r.destinations);
        setContactLimit(r.contactLimit);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load the recipients."));
    return () => {
      cancelled = true;
    };
    // `selected` is read only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, botId]);

  const query = search.trim().toLowerCase();
  const shown = useMemo(
    () => (destinations ?? []).filter((d) => !query || d.name.toLowerCase().includes(query) || d.chatId.includes(query)),
    [destinations, query]
  );
  const chosenSet = new Set(chosen);
  const atMax = chosen.length >= max;
  const people = (destinations ?? []).filter((d) => d.kind === "user").length;

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= max ? c : [...c, id]));
  const selectable = (d: Destination) => !d.blocked;
  const selectAllShown = () =>
    setChosen((c) => {
      const next = [...c];
      for (const d of shown) if (selectable(d) && !next.includes(d.chatId) && next.length < max) next.push(d.chatId);
      return next;
    });

  function addManual() {
    const id = manual.trim();
    const error = validateChatId(id);
    if (error) return void toast.error(error);
    if (!chosenSet.has(id)) {
      if (atMax) return void toast.error(`At most ${max} recipients.`);
      setChosen((c) => [...c, id]);
    }
    setManual("");
  }

  const manualOnly = chosen.filter((id) => !(destinations ?? []).some((d) => d.chatId === id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          Tick who should get the message (up to {max}). For a channel the bot must be an admin that is allowed to post.
        </DialogDescription>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or chat ID" aria-label="Search recipients" />
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {destinations === null ? (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">{destinations.length === 0 ? "The bot hasn't seen any chats yet." : "Nothing matches your search."}</p>
          ) : (
            SECTIONS.map((section) => {
              const rows = shown.filter((d) => section.kind.includes(d.kind));
              if (rows.length === 0) return null;
              return (
                <fieldset key={section.title} className="space-y-1">
                  <legend className="mb-1 text-xs font-medium text-[var(--muted)]">{section.title}</legend>
                  {rows.map((d) => {
                    // Only an unchecked row is ever locked: a chosen contact who has since blocked the bot must stay removable.
                    const disabled = !chosenSet.has(d.chatId) && (!selectable(d) || atMax);
                    return (
                      <label key={d.chatId} className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm ${disabled ? "opacity-50" : "cursor-pointer hover:bg-[var(--card-border)]/40"}`}>
                        <input type="checkbox" checked={chosenSet.has(d.chatId)} disabled={disabled} onChange={() => toggle(d.chatId)} />
                        <span className="min-w-0 flex-1 truncate">{d.name}</span>
                        <span className="shrink-0 text-xs text-[var(--muted)]">{d.blocked ? "blocked the bot" : d.kind === "user" ? "" : d.kind}</span>
                      </label>
                    );
                  })}
                </fieldset>
              );
            })
          )}
          {destinations !== null && !destinations.some((d) => d.kind !== "user") && (
            <p className="text-xs text-[var(--muted)]">
              No groups or channels yet. The bot only knows chats it has seen: add one under Configure → Groups &amp; channels (&ldquo;add by ID&rdquo; or &ldquo;import from my channels&rdquo;).
            </p>
          )}
          {contactLimit > 0 && people >= contactLimit && (
            <p className="text-xs text-[var(--muted)]">Showing the {contactLimit} most recently active people; search covers only these.</p>
          )}
          {manualOnly.length > 0 && (
            <p className="text-xs text-[var(--muted)]">
              Also chosen by ID:{" "}
              {manualOnly.map((id, i) => (
                <button key={id} type="button" className="underline" onClick={() => toggle(id)} title="Remove">
                  {id}
                  {i < manualOnly.length - 1 ? ", " : ""}
                </button>
              ))}
            </p>
          )}
        </div>
        {allowManual && (
          <div className="flex gap-2">
            <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Or add a chat ID" aria-label="Chat ID" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addManual())} />
            <Button type="button" variant="outline" onClick={addManual}>
              Add
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--muted)]">
            {chosen.length} chosen{atMax ? " (limit reached)" : ""}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={selectAllShown} disabled={atMax}>
            Select all shown
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setChosen([])} disabled={chosen.length === 0}>
            Clear
          </Button>
          <span className="ml-auto flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={chosen.length === 0}
              onClick={() => {
                onApply(chosen, destinations ?? []);
                onOpenChange(false);
              }}
            >
              Use these
            </Button>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
