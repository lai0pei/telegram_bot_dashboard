"use client";

import { ArrowLeft, ArrowRight, ExternalLink, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-client";
import type { TelegramSticker, TelegramStickerSet } from "@/lib/botapi";
import { validateStickerEmoji, validateStickerFile, validateStickerSetShortName, validateStickerTitle } from "@/lib/validation";
import type { BotDetail } from "./types";

interface StoredSet {
  name: string;
  title: string;
  type: "regular" | "mask" | "custom_emoji";
}

const select = "h-10 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 text-sm";

/** What an <img> can show for a sticker: the file itself when it is a still image, else Telegram's thumbnail (if any). */
function previewFileId(s: TelegramSticker): string | null {
  return s.is_animated || s.is_video ? (s.thumbnail?.file_id ?? null) : s.file_id;
}

/** Sticker and custom-emoji packs owned by the active Telegram account and edited through this bot. */
export function StickersTab({ bot }: { bot: BotDetail }) {
  const [sets, setSets] = useState<StoredSet[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSets((await apiFetch<{ sets: StoredSet[] }>(`/api/bots/${bot.id}/stickers`)).sets);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load sticker sets.");
      setSets([]);
    }
  }, [bot.id]);

  useEffect(() => {
    // Intentional: fetch-on-mount into local state, not state synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (!bot.hasToken) return <Card className="text-sm">Fetch the bot&apos;s token first to manage sticker sets.</Card>;

  return (
    <div className="space-y-4">
      <NewSetCard bot={bot} onCreated={(name) => void load().then(() => setSelected(name))} />
      <ImportCard bot={bot} onImported={(name) => void load().then(() => setSelected(name))} />

      <Card>
        <CardHeader>
          <CardTitle>Your sets</CardTitle>
        </CardHeader>
        {sets === null ? (
          <Skeleton className="h-16" />
        ) : sets.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No sets yet. Create one above, or import one this bot already made.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sets.map((s) => (
              <Button key={s.name} size="sm" variant={selected === s.name ? "default" : "outline"} onClick={() => setSelected(s.name)}>
                {s.title}
                {s.type === "custom_emoji" && " (emoji)"}
              </Button>
            ))}
          </div>
        )}
      </Card>

      {selected && sets?.some((s) => s.name === selected) && (
        <SetEditor
          key={selected}
          bot={bot}
          name={selected}
          onGone={() => {
            setSelected(null);
            void load();
          }}
          onRenamed={() => void load()}
        />
      )}
    </div>
  );
}

function NewSetCard({ bot, onCreated }: { bot: BotDetail; onCreated: (name: string) => void }) {
  const [short, setShort] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"regular" | "custom_emoji">("regular");
  const [emoji, setEmoji] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const touched = Boolean(short || title || emoji || file);
  const error = touched
    ? (validateStickerSetShortName(short, bot.username) ?? validateStickerTitle(title) ?? validateStickerEmoji(emoji) ?? (file ? validateStickerFile(file) : "Pick the first sticker file."))
    : null;
  const canCreate = touched && !error && !saving;

  async function create() {
    if (!file) return;
    setSaving(true);
    try {
      const body = new FormData();
      body.append("name", short);
      body.append("title", title);
      body.append("type", type);
      body.append("emoji", emoji);
      body.append("file", file);
      const { name } = await apiFetch<{ name: string }>(`/api/bots/${bot.id}/stickers`, { body });
      toast.success("Sticker set created.");
      setShort("");
      setTitle("");
      setEmoji("");
      setFile(null);
      onCreated(name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create the set.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New sticker set</CardTitle>
      </CardHeader>
      <p className="mb-3 text-xs text-[var(--muted)]">
        The set is owned by your linked Telegram account and edited through @{bot.username}. Telegram may need you to have pressed Start in the bot once.
      </p>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="set-short">Short name</Label>
            <Input id="set-short" value={short} onChange={(e) => setShort(e.target.value)} placeholder="cats" />
            <p className="truncate text-xs text-[var(--muted)]">t.me/addstickers/{short || "name"}_by_{bot.username}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="set-title">Title</Label>
            <Input id="set-title" value={title} maxLength={64} onChange={(e) => setTitle(e.target.value)} placeholder="Cats" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[180px_1fr_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="set-type">Type</Label>
            <select id="set-type" className={`${select} w-full`} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="regular">Stickers</option>
              <option value="custom_emoji">Custom emoji</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="set-emoji">Emoji for the first sticker</Label>
            <Input id="set-emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="😺" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="set-file">First sticker</Label>
            <input id="set-file" type="file" accept=".webp,.png,.webm,.tgs" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
          </div>
        </div>
        <FieldError error={error} />
        <p className="text-xs text-[var(--muted)]">
          Still stickers: 512×512 WEBP or PNG up to 512 KB. Video: WEBM up to 256 KB. Animated: .tgs up to 64 KB. Telegram checks dimensions itself.
        </p>
        <Button onClick={create} disabled={!canCreate} loading={saving}>
          Create set
        </Button>
      </div>
    </Card>
  );
}

function ImportCard({ bot, onImported }: { bot: BotDetail; onImported: (name: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const result = await apiFetch<{ name: string }>(`/api/bots/${bot.id}/stickers/import`, { body: { name } });
      toast.success("Set added.");
      setName("");
      onImported(result.name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add the set.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold">Add an existing set</span>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={`cats_by_${bot.username}`}
        aria-label="Sticker set name or link"
        className="min-w-0 flex-1"
      />
      <Button variant="outline" size="sm" onClick={run} disabled={!name.trim() || busy} loading={busy}>
        Add
      </Button>
      <p className="basis-full text-xs text-[var(--muted)]">Telegram can&apos;t list a bot&apos;s sets, so add ones created earlier by name. Only sets ending in _by_{bot.username} can be edited.</p>
    </Card>
  );
}

function SetEditor({ bot, name, onGone, onRenamed }: { bot: BotDetail; name: string; onGone: () => void; onRenamed: () => void }) {
  const base = `/api/bots/${bot.id}/stickers/${encodeURIComponent(name)}`;
  const [set, setSet] = useState<TelegramStickerSet | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [emoji, setEmoji] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    try {
      const { set: loaded } = await apiFetch<{ set: TelegramStickerSet }>(base);
      setSet(loaded);
      setTitle(loaded.title);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load the set.");
      onGone();
    }
  }, [base, onGone]);

  useEffect(() => {
    // Intentional: fetch-on-mount into local state, not state synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  if (!set) return <Skeleton className="h-48" />;
  const addError = emoji || file ? (validateStickerEmoji(emoji) ?? (file ? validateStickerFile(file) : "Pick a sticker file.")) : null;
  const titleError = title !== set.title ? validateStickerTitle(title) : null;

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={title} maxLength={64} onChange={(e) => setTitle(e.target.value)} aria-label="Set title" className="min-w-0 flex-1" />
        <Button
          size="sm"
          variant="outline"
          disabled={busy || title === set.title || Boolean(titleError)}
          onClick={() =>
            void run(async () => {
              await apiFetch(base, { method: "PATCH", body: { title } });
              onRenamed();
            }, "Title saved.")
          }
        >
          Rename
        </Button>
        <a href={`https://t.me/addstickers/${name}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline">
          Open in Telegram <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
        {confirmDelete ? (
          <span className="flex items-center gap-1">
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void run(async () => { await apiFetch(base, { method: "DELETE" }); onGone(); }, "Set deleted.")}>
              Delete set
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} aria-label="Delete the whole set">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      <FieldError error={titleError} />

      {set.stickers.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">This set is empty.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {set.stickers.map((s, i) => {
            const preview = previewFileId(s);
            return (
              <li key={s.file_unique_id} className="rounded-lg border border-[var(--card-border)] p-2 text-center">
                <div className="flex h-20 items-center justify-center">
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- authenticated image from our own API
                    <img src={`/api/bots/${bot.id}/stickers/file?fileId=${encodeURIComponent(preview)}`} alt={s.emoji ?? "sticker"} loading="lazy" className="max-h-20 max-w-full object-contain" />
                  ) : (
                    <span className="text-3xl" aria-hidden>
                      {s.emoji ?? "🖼️"}
                    </span>
                  )}
                </div>
                <div className="mt-1 truncate text-xs text-[var(--muted)]">
                  {s.emoji} {s.is_animated ? "· animated" : s.is_video ? "· video" : ""}
                </div>
                <div className="mt-1 flex justify-center gap-1">
                  <Button size="icon" variant="ghost" disabled={busy || i === 0} aria-label="Move earlier" onClick={() => void run(() => apiFetch(`${base}/stickers`, { method: "PATCH", body: { fileId: s.file_id, position: i - 1 } }), "Moved.")}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" disabled={busy || i === set.stickers.length - 1} aria-label="Move later" onClick={() => void run(() => apiFetch(`${base}/stickers`, { method: "PATCH", body: { fileId: s.file_id, position: i + 1 } }), "Moved.")}>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" disabled={busy} aria-label="Delete sticker" onClick={() => void run(() => apiFetch(`${base}/stickers?fileId=${encodeURIComponent(s.file_id)}`, { method: "DELETE" }), "Sticker deleted.")}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-2 border-t border-[var(--card-border)] pt-3">
        <h4 className="text-sm font-semibold">Add a sticker</h4>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="😺" aria-label="Emoji" className="w-24" />
          <input type="file" accept=".webp,.png,.webm,.tgs" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="min-w-0 flex-1 text-sm" aria-label="Sticker file" />
          <Button
            size="sm"
            disabled={busy || !file || Boolean(addError)}
            onClick={() =>
              void run(async () => {
                const body = new FormData();
                body.append("emoji", emoji);
                body.append("file", file as File);
                await apiFetch(`${base}/stickers`, { body });
                setEmoji("");
                setFile(null);
              }, "Sticker added.")
            }
          >
            Add
          </Button>
        </div>
        <FieldError error={addError} />
      </div>
    </Card>
  );
}
