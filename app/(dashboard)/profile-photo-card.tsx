"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-client";
import { validateProfileMedia, validateProfilePhoto } from "@/lib/validation";

/** Preview + upload/remove for a bot's or chat's profile photo. `endpoint` is its /photo API route. */
export function ProfilePhotoCard({
  endpoint,
  name,
  photoSrc,
  disabledReason,
  onChanged,
  allowVideo = false,
}: {
  endpoint: string;
  name: string;
  /** Current photo URL (the parent appends a version so it refetches after a change). */
  photoSrc: string;
  /** When set, upload/remove are disabled and this explains why. */
  disabledReason?: string;
  /** Called after a successful upload or removal so the parent can refresh every avatar of this entity. */
  onChanged: () => void;
  /** Also accept a short square MP4 as a profile video (bots only). */
  allowVideo?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (!file) return;
    const error = allowVideo ? validateProfileMedia(file) : validateProfilePhoto(file);
    if (error) {
      toast.error(error);
      return;
    }
    setBusy("upload");
    try {
      const body = new FormData();
      body.append("file", file);
      await apiFetch(endpoint, { method: "PUT", body });
      toast.success("Photo updated.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update the photo.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove() {
    setConfirmRemove(false);
    setBusy("remove");
    try {
      await apiFetch(endpoint, { method: "DELETE" });
      toast.success("Photo removed.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove the photo.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <Avatar src={photoSrc} name={name} className="h-16 w-16" textClassName="text-xl" />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold">Profile photo</h3>
        <p className="text-xs text-[var(--muted)]">
          {disabledReason ?? (allowVideo ? "JPEG or PNG, or a short square MP4 (up to 10 s) as a profile video; up to 10 MB." : "JPEG or PNG, up to 10 MB. Square images work best.")}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input ref={input} type="file" accept={allowVideo ? "image/jpeg,image/png,video/mp4" : "image/jpeg,image/png"} className="hidden" onChange={handleFile} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={busy === "upload"}
          disabled={Boolean(disabledReason) || busy !== null}
          onClick={() => input.current?.click()}
        >
          <ImagePlus className="h-3.5 w-3.5" />
          Upload
        </Button>
        {confirmRemove ? (
          <>
            <Button type="button" variant="danger" size="sm" loading={busy === "remove"} onClick={() => void handleRemove()}>
              Remove photo
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmRemove(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={Boolean(disabledReason) || busy !== null}
            onClick={() => setConfirmRemove(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </Button>
        )}
      </div>
    </Card>
  );
}
