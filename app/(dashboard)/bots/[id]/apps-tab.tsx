"use client";

import { Gamepad2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-client";
import { validateAppShortName, validateAppTexts, validateHttpsUrlOrNull } from "@/lib/validation";
import type { BotDetail } from "./types";

interface Game {
  id: number;
  shortName: string;
  title: string;
  description: string | null;
  url: string | null;
}

interface MiniApp {
  id: number;
  shortName: string;
  title: string;
  description: string | null;
  url: string | null;
}

type Kind = "games" | "mini-apps";

/** Reads a PNG/JPEG's pixel size in the browser, so a wrong-sized picture is caught before BotFather is involved. */
function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

function CreateForm({ bot, kind, onCreated }: { bot: BotDetail; kind: Kind; onCreated: () => void }) {
  const isApp = kind === "mini-apps";
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [shortName, setShortName] = useState("");
  const [url, setUrl] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const error =
    (title || description ? validateAppTexts(title, description) : null) ??
    (shortName ? validateAppShortName(shortName) : null) ??
    (url ? validateHttpsUrlOrNull(url, isApp ? "Mini App URL" : "Game URL") : null) ??
    photoError;
  const ready = Boolean(title.trim() && description.trim() && shortName && photo && (isApp ? url : true)) && !error && !saving;

  async function pick(file: File | undefined) {
    setPhoto(null);
    setPhotoError(null);
    if (!file) return;
    const size = await readImageSize(file);
    if (!size) setPhotoError("The picture must be a PNG or JPEG image.");
    else if (size.width !== 640 || size.height !== 360) setPhotoError(`The picture must be exactly 640×360 pixels (it is ${size.width}×${size.height}).`);
    else setPhoto(file);
  }

  async function submit() {
    if (!photo) return;
    setSaving(true);
    try {
      const body = new FormData();
      body.append("title", title);
      body.append("description", description);
      body.append("shortName", shortName);
      body.append("photo", photo);
      if (url.trim()) body.append("url", url.trim());
      await apiFetch(`/api/bots/${bot.id}/${kind}`, { body });
      toast.success(isApp ? "Mini App created." : "Game created.");
      setTitle("");
      setDescription("");
      setShortName("");
      setUrl("");
      setPhoto(null);
      if (fileInput.current) fileInput.current.value = "";
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create it.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${kind}-title`}>Title</Label>
          <Input id={`${kind}-title`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={64} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${kind}-short`}>Short name</Label>
          <Input id={`${kind}-short`} value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="my_game" maxLength={30} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${kind}-desc`}>Description</Label>
        <Input id={`${kind}-desc`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={512} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${kind}-url`}>{isApp ? "Web App URL (https)" : "Page the Play button opens (https, optional)"}</Label>
        <Input id={`${kind}-url`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${kind}-photo`}>Picture (640×360 PNG or JPEG)</Label>
        <input
          id={`${kind}-photo`}
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg"
          onChange={(e) => void pick(e.target.files?.[0])}
          className="block text-sm"
        />
      </div>
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
      <p className="text-xs text-[var(--muted)]">Created by chatting with @BotFather for you, which takes a few seconds.</p>
      <Button onClick={() => void submit()} disabled={!ready} loading={saving}>
        {isApp ? "Create Mini App" : "Create game"}
      </Button>
    </div>
  );
}

function GameRow({ bot, game, onChanged }: { bot: BotDetail; game: Game; onChanged: () => void }) {
  const [url, setUrl] = useState(game.url ?? "");
  const [busy, setBusy] = useState<"url" | "delete" | "send" | null>(null);
  const [chatId, setChatId] = useState("");
  const [confirm, setConfirm] = useState(false);
  const urlError = url ? validateHttpsUrlOrNull(url, "Game URL") : null;

  async function saveUrl() {
    setBusy("url");
    try {
      await apiFetch(`/api/bots/${bot.id}/games/${game.id}`, { method: "PATCH", body: { url } });
      toast.success("Game page saved.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save the page.");
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    setBusy("send");
    try {
      await apiFetch(`/api/bots/${bot.id}/games/${game.id}/send`, { body: { chatId: chatId.trim() } });
      toast.success("Game sent.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send the game.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      await apiFetch(`/api/bots/${bot.id}/games/${game.id}`, { method: "DELETE" });
      toast.success("Game deleted.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete the game.");
      setBusy(null);
      setConfirm(false);
    }
  }

  return (
    <li className="space-y-2 py-3">
      <div className="flex items-center gap-2">
        <Gamepad2 className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{game.title}</p>
          <p className="truncate text-xs text-[var(--muted)]">{game.shortName}</p>
        </div>
        {confirm ? (
          <>
            <Button variant="danger" size="sm" loading={busy === "delete"} onClick={() => void remove()}>
              Delete via BotFather
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="icon" onClick={() => setConfirm(true)} aria-label="Delete game">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… page the Play button opens" aria-label="Game page URL" />
        <Button variant="outline" size="sm" disabled={url === (game.url ?? "") || Boolean(urlError)} loading={busy === "url"} onClick={() => void saveUrl()}>
          Save page
        </Button>
      </div>
      {urlError && <p className="text-xs text-[var(--danger)]">{urlError}</p>}
      <div className="flex gap-2">
        <Input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="Chat ID to send the game to" aria-label="Chat ID" inputMode="numeric" />
        <Button variant="outline" size="sm" disabled={!/^-?\d+$/.test(chatId.trim())} loading={busy === "send"} onClick={() => void send()}>
          Send game
        </Button>
      </div>
    </li>
  );
}

function MiniAppRow({ bot, app, onChanged }: { bot: BotDetail; app: MiniApp; onChanged: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const link = `https://t.me/${bot.username}/${app.shortName}`;

  async function remove() {
    setDeleting(true);
    try {
      await apiFetch(`/api/bots/${bot.id}/mini-apps/${app.id}`, { method: "DELETE" });
      toast.success("Mini App deleted.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete the Mini App.");
      setDeleting(false);
      setConfirm(false);
    }
  }

  return (
    <li className="flex items-center gap-2 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{app.title}</p>
        <p className="truncate text-xs text-[var(--muted)]">
          {link} · {app.url}
        </p>
      </div>
      {confirm ? (
        <>
          <Button variant="danger" size="sm" loading={deleting} onClick={() => void remove()}>
            Delete via BotFather
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <Button variant="ghost" size="icon" onClick={() => setConfirm(true)} aria-label="Delete Mini App">
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </li>
  );
}

/** HTML5 games and Mini Apps created through BotFather (/newgame, /newapp), with the Play-button page kept here. */
export function AppsTab({ bot }: { bot: BotDetail }) {
  const [games, setGames] = useState<Game[] | null>(null);
  const [apps, setApps] = useState<MiniApp[] | null>(null);

  const load = useCallback(async () => {
    try {
      const [g, a] = await Promise.all([
        apiFetch<{ games: Game[] }>(`/api/bots/${bot.id}/games`),
        apiFetch<{ apps: MiniApp[] }>(`/api/bots/${bot.id}/mini-apps`),
      ]);
      setGames(g.games);
      setApps(a.apps);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load games and Mini Apps.");
      setGames([]);
      setApps([]);
    }
  }, [bot.id]);

  useEffect(() => {
    // Intentional: fetch-on-mount into local state, not state synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <Card className="text-sm">
        <Badge variant="danger" className="mb-2">
          Not yet verified against real BotFather
        </Badge>
        <p className="text-[var(--muted)]">
          These flows script @BotFather&rsquo;s dialogue. Its exact wording hasn&rsquo;t been recorded yet, so if it replies with something unexpected the action
          stops and shows what BotFather said. Only games and Mini Apps created here are listed (Telegram can&rsquo;t list them).
        </p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mini Apps</CardTitle>
        </CardHeader>
        {apps === null ? (
          <Skeleton className="h-16" />
        ) : apps.length > 0 ? (
          <ul className="mb-4 divide-y divide-[var(--card-border)]">
            {apps.map((a) => (
              <MiniAppRow key={a.id} bot={bot} app={a} onChanged={load} />
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-[var(--muted)]">No Mini Apps created here yet.</p>
        )}
        <CreateForm bot={bot} kind="mini-apps" onCreated={load} />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>HTML5 games</CardTitle>
        </CardHeader>
        {games === null ? (
          <Skeleton className="h-16" />
        ) : games.length > 0 ? (
          <ul className="mb-4 divide-y divide-[var(--card-border)]">
            {games.map((g) => (
              <GameRow key={g.id} bot={bot} game={g} onChanged={load} />
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-[var(--muted)]">No games created here yet.</p>
        )}
        <p className="mb-3 text-xs text-[var(--muted)]">
          Send a game to a chat by its ID; while monitoring is on, pressing Play opens the page saved for that game.
        </p>
        <CreateForm bot={bot} kind="games" onCreated={load} />
      </Card>
    </div>
  );
}
