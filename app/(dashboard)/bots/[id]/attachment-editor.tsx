"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Paperclip, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api-client";
import {
  DICE_EMOJIS,
  FOLLOW_UP_KINDS,
  FOLLOW_UP_LABELS,
  MAX_FOLLOW_UPS,
  MAX_FOLLOW_UP_DELAY_S,
  RULE_MEDIA_KINDS,
  RULE_MEDIA_LABELS,
  type FollowUpKind,
  type RuleMediaKind,
  type RuleMediaRef,
} from "@/lib/rule-content";
import { ButtonsField } from "./buttons-editor";
import type { FollowUpDraft } from "./rule-draft";

const select = "h-10 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 text-sm";

const ACCEPT: Record<RuleMediaKind, string> = {
  photo: "image/jpeg,image/png,image/webp",
  video: "video/mp4",
  animation: "image/gif,video/mp4",
  document: "",
  audio: "audio/mpeg,audio/mp4,audio/x-m4a,.mp3,.m4a",
  voice: "audio/ogg,audio/mpeg,audio/mp4,.ogg,.oga,.mp3,.m4a",
  sticker: "image/webp,video/webm",
};

/** Picks a kind, uploads the file to this bot's rule storage, and hands back the reference to save in the rule. */
export function AttachmentField({
  botId,
  media,
  onChange,
  idPrefix,
}: {
  botId: number;
  media: RuleMediaRef | null;
  onChange: (media: RuleMediaRef | null) => void;
  idPrefix: string;
}) {
  const [kind, setKind] = useState<RuleMediaKind>(media?.kind ?? "photo");
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("kind", kind);
      const res = await apiFetch<{ media: RuleMediaRef }>(`/api/bots/${botId}/rule-media`, { method: "POST", body: form });
      onChange(res.media);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  if (media) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-[var(--card-border)] p-2 text-sm">
        {media.kind === "photo" || media.kind === "sticker" ? (
          // eslint-disable-next-line @next/next/no-img-element -- a private, authenticated preview of a just-uploaded file
          <img src={`/api/bots/${botId}/rule-media/${media.mediaId}`} alt="" className="h-12 w-12 rounded object-cover" />
        ) : (
          <Paperclip className="h-5 w-5 shrink-0 text-[var(--muted)]" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{media.name || "File"}</p>
          <p className="text-xs text-[var(--muted)]">{RULE_MEDIA_LABELS[media.kind]}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)} aria-label="Remove the attachment">
          <X className="h-3.5 w-3.5" /> Remove
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Label htmlFor={`${idPrefix}-kind`} className="sr-only">
        Kind of attachment
      </Label>
      <select id={`${idPrefix}-kind`} className={select} value={kind} onChange={(e) => setKind(e.target.value as RuleMediaKind)}>
        {RULE_MEDIA_KINDS.map((k) => (
          <option key={k} value={k}>
            {RULE_MEDIA_LABELS[k]}
          </option>
        ))}
      </select>
      <input
        ref={input}
        type="file"
        accept={ACCEPT[kind] || undefined}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <Button type="button" variant="outline" size="sm" loading={uploading} onClick={() => input.current?.click()}>
        {!uploading && <Paperclip className="h-3.5 w-3.5" />} Choose file
      </Button>
    </div>
  );
}

const newFollowUp = (kind: FollowUpKind): FollowUpDraft => {
  switch (kind) {
    case "text":
      return { kind, text: "", buttonDrafts: [] };
    case "media":
      return { kind, media: null, caption: "", buttonDrafts: [] };
    case "location":
      return { kind, latitude: "", longitude: "" };
    case "contact":
      return { kind, phone: "", firstName: "" };
    case "dice":
      return { kind, emoji: DICE_EMOJIS[0] };
  }
};

/** Up to four messages sent after the main one, each with its own wait and an optional "typing…". */
export function FollowUpsEditor({
  botId,
  items,
  onChange,
  idPrefix,
}: {
  botId: number;
  items: FollowUpDraft[];
  onChange: (items: FollowUpDraft[]) => void;
  idPrefix: string;
}) {
  const update = (i: number, patch: Partial<FollowUpDraft>) => onChange(items.map((f, j) => (j === i ? ({ ...f, ...patch } as FollowUpDraft) : f)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...items];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {items.length > 0 && <Label>Then send</Label>}
      {items.map((f, i) => {
        const id = `${idPrefix}-fu${i}`;
        return (
          <div key={i} className="space-y-2 rounded-lg border border-[var(--card-border)] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--muted)]">Message {i + 2}</span>
              <select
                aria-label={`Kind of message ${i + 2}`}
                className={select}
                value={f.kind}
                // A different kind has different fields, so start it fresh but keep the wait and typing settings.
                onChange={(e) => onChange(items.map((x, j) => (j === i ? ({ ...newFollowUp(e.target.value as FollowUpKind), delaySec: x.delaySec, typing: x.typing } as FollowUpDraft) : x)))}
              >
                {FOLLOW_UP_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {FOLLOW_UP_LABELS[k]}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs">
                Wait
                <Input
                  type="number"
                  min={0}
                  max={MAX_FOLLOW_UP_DELAY_S}
                  className="h-9 w-16"
                  value={f.delaySec ?? 0}
                  onChange={(e) => update(i, { delaySec: Math.max(0, Math.min(MAX_FOLLOW_UP_DELAY_S, Math.round(Number(e.target.value) || 0))) })}
                />
                s
              </label>
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={f.typing === true} onChange={(e) => update(i, { typing: e.target.checked })} />
                Show &ldquo;typing…&rdquo;
              </label>
              <span className="ml-auto flex gap-1">
                <Button type="button" variant="outline" size="sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove this message">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </span>
            </div>

            {f.kind === "text" && (
              <Textarea id={`${id}-text`} aria-label={`Text of message ${i + 2}`} value={f.text} maxLength={4096} onChange={(e) => update(i, { text: e.target.value })} />
            )}
            {(f.kind === "text" || f.kind === "media") && (
              <ButtonsField label={`Buttons under message ${i + 2}`} drafts={f.buttonDrafts} onChange={(buttonDrafts) => update(i, { buttonDrafts })} botId={botId} />
            )}
            {f.kind === "media" && (
              <>
                <AttachmentField botId={botId} media={f.media} onChange={(m) => update(i, { media: m })} idPrefix={id} />
                {f.media?.kind !== "sticker" && (
                  <Textarea
                    id={`${id}-caption`}
                    aria-label={`Caption of message ${i + 2}`}
                    placeholder="Caption (optional)"
                    value={f.caption ?? ""}
                    maxLength={1024}
                    onChange={(e) => update(i, { caption: e.target.value })}
                  />
                )}
              </>
            )}
            {f.kind === "location" && (
              <div className="grid grid-cols-2 gap-2">
                <Input aria-label="Latitude" placeholder="Latitude, e.g. 48.8584" inputMode="decimal" value={f.latitude} onChange={(e) => update(i, { latitude: e.target.value })} />
                <Input aria-label="Longitude" placeholder="Longitude, e.g. 2.2945" inputMode="decimal" value={f.longitude} onChange={(e) => update(i, { longitude: e.target.value })} />
              </div>
            )}
            {f.kind === "contact" && (
              <div className="grid gap-2 sm:grid-cols-3">
                <Input aria-label="Phone number" placeholder="+1 555 0100" value={f.phone} onChange={(e) => update(i, { phone: e.target.value })} />
                <Input aria-label="First name" placeholder="First name" maxLength={64} value={f.firstName} onChange={(e) => update(i, { firstName: e.target.value })} />
                <Input aria-label="Last name" placeholder="Last name (optional)" maxLength={64} value={f.lastName ?? ""} onChange={(e) => update(i, { lastName: e.target.value })} />
              </div>
            )}
            {f.kind === "dice" && (
              <select aria-label="Dice emoji" className={select} value={f.emoji} onChange={(e) => update(i, { emoji: e.target.value as (typeof DICE_EMOJIS)[number] })}>
                {DICE_EMOJIS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      })}
      {items.length < MAX_FOLLOW_UPS && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, newFollowUp("text")])}>
          <Plus className="h-3.5 w-3.5" /> Add another message
        </Button>
      )}
    </div>
  );
}
