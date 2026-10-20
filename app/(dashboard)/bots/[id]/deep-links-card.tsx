"use client";

import { Copy, QrCode, Trash2 } from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-client";
import { DEEP_LINK_ADMIN_RIGHTS, validateDeepLink, type DeepLinkKind } from "@/lib/deep-links-shared";
import type { BotDetail } from "./types";

interface SavedLink {
  id: number;
  label: string;
  kind: DeepLinkKind;
  payload: string;
  appShortName: string | null;
  admin: string[];
  url: string;
  arrivals: number | null;
}

const KIND_LABELS: Record<DeepLinkKind, string> = {
  start: "Start the bot (?start=)",
  startgroup: "Add to a group (?startgroup=)",
  startchannel: "Add to a channel (?startchannel=)",
  startapp: "Open a Mini App (?startapp=)",
};

const select = "h-10 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 text-sm";

/** Builds, saves and counts `t.me` deep links; pair a /start payload with a "Deep link" rule to answer it. */
export function DeepLinksCard({ bot }: { bot: BotDetail }) {
  const [links, setLinks] = useState<SavedLink[] | null>(null);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<DeepLinkKind>("start");
  const [payload, setPayload] = useState("");
  const [appShortName, setAppShortName] = useState("");
  const [admin, setAdmin] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [qr, setQr] = useState<{ id: number; dataUrl: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setLinks((await apiFetch<{ links: SavedLink[] }>(`/api/bots/${bot.id}/deep-links`)).links);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load deep links.");
      setLinks([]);
    }
  }, [bot.id]);

  useEffect(() => {
    // Intentional: fetch-on-mount into local state, not state synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const input = { label, kind, payload, appShortName: appShortName.trim() || null, admin };
  const error = label || payload ? validateDeepLink(input) : null;
  const canSave = Boolean(label.trim() && payload) && !error && !saving;

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/api/bots/${bot.id}/deep-links`, { body: input });
      setLabel("");
      setPayload("");
      setAdmin([]);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save the link.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(link: SavedLink) {
    try {
      await apiFetch(`/api/bots/${bot.id}/deep-links/${link.id}`, { method: "DELETE" });
      if (qr?.id === link.id) setQr(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete the link.");
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied.");
    } catch {
      toast.error("Couldn't copy; select the link and copy it by hand.");
    }
  }

  async function showQr(link: SavedLink) {
    if (qr?.id === link.id) return setQr(null);
    setQr({ id: link.id, dataUrl: await QRCode.toDataURL(link.url, { margin: 1, width: 192 }) });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deep links</CardTitle>
        <span className="text-xs text-[var(--muted)]">Links that open the bot with a payload; count where new contacts came from.</span>
      </CardHeader>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_220px_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="dl-label">Label</Label>
            <Input id="dl-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Spring campaign" maxLength={60} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dl-kind">Type</Label>
            <select id="dl-kind" className={`${select} w-full`} value={kind} onChange={(e) => setKind(e.target.value as DeepLinkKind)}>
              {(Object.keys(KIND_LABELS) as DeepLinkKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dl-payload">Payload</Label>
            <Input id="dl-payload" value={payload} onChange={(e) => setPayload(e.target.value)} placeholder="spring_2026" maxLength={64} />
          </div>
        </div>
        {kind === "startapp" && (
          <div className="space-y-1.5">
            <Label htmlFor="dl-app">Mini App short name (leave empty for the bot&rsquo;s main Mini App)</Label>
            <Input id="dl-app" value={appShortName} onChange={(e) => setAppShortName(e.target.value)} placeholder="myapp" />
          </div>
        )}
        {(kind === "startgroup" || kind === "startchannel") && (
          <div className="space-y-1">
            <p className="text-xs text-[var(--muted)]">Admin rights to request when it&rsquo;s added (optional):</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {DEEP_LINK_ADMIN_RIGHTS.map((r) => (
                <label key={r} className="flex items-center gap-1">
                  <input type="checkbox" checked={admin.includes(r)} onChange={(e) => setAdmin(e.target.checked ? [...admin, r] : admin.filter((x) => x !== r))} />
                  {r.replaceAll("_", " ")}
                </label>
              ))}
            </div>
          </div>
        )}
        <FieldError error={error} />
        {kind === "start" && (
          <p className="text-xs text-[var(--muted)]">Add a &ldquo;Deep link&rdquo; rule with the same payload in Automation to answer it; without one, /start&rsquo;s own rule replies.</p>
        )}
        <Button onClick={save} disabled={!canSave} loading={saving}>
          Save link
        </Button>

        {links === null ? (
          <Skeleton className="h-16" />
        ) : links.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No saved links yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--card-border)]">
            {links.map((link) => (
              <li key={link.id} className="space-y-2 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{link.label}</p>
                    <p className="truncate text-xs text-[var(--muted)]">{link.url}</p>
                    {link.arrivals !== null && (
                      <p className="text-xs text-[var(--muted)]">
                        {link.arrivals} new contact{link.arrivals === 1 ? "" : "s"} (counted while monitoring is on)
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => void copy(link.url)} aria-label="Copy link">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => void showQr(link)} aria-label="Show QR code">
                    <QrCode className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => void remove(link)} aria-label="Delete link">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {qr?.id === link.id && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr.dataUrl} alt={`QR code for ${link.label}`} width={192} height={192} className="rounded-lg bg-white" />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
