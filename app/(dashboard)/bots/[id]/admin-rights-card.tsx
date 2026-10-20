"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-client";
import type { ChatAdministratorRights } from "@/lib/botapi";
import type { BotDetail } from "./types";

type RightKey = keyof ChatAdministratorRights;

const RIGHTS: { key: RightKey; label: string; channels: boolean; groups: boolean }[] = [
  { key: "can_manage_chat", label: "Manage chat", groups: true, channels: true },
  { key: "can_change_info", label: "Change info", groups: true, channels: true },
  { key: "can_delete_messages", label: "Delete messages", groups: true, channels: true },
  { key: "can_invite_users", label: "Invite users", groups: true, channels: true },
  { key: "can_restrict_members", label: "Restrict members", groups: true, channels: true },
  { key: "can_pin_messages", label: "Pin messages", groups: true, channels: false },
  { key: "can_manage_topics", label: "Manage topics", groups: true, channels: false },
  { key: "can_post_messages", label: "Post messages", groups: false, channels: true },
  { key: "can_edit_messages", label: "Edit messages", groups: false, channels: true },
  { key: "can_manage_video_chats", label: "Manage video chats", groups: true, channels: true },
  { key: "can_promote_members", label: "Add admins", groups: true, channels: true },
  { key: "is_anonymous", label: "Anonymous", groups: true, channels: true },
];

function RightsColumn({ botId, forChannels, initial }: { botId: number; forChannels: boolean; initial: ChatAdministratorRights }) {
  const [rights, setRights] = useState<ChatAdministratorRights>(initial);
  const [saving, setSaving] = useState(false);
  const visible = RIGHTS.filter((r) => (forChannels ? r.channels : r.groups));

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/api/bots/${botId}/admin-rights`, { method: "PUT", body: { forChannels, rights } });
      toast.success(`${forChannels ? "Channel" : "Group"} rights saved.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save rights.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h4 className="mb-3 text-sm font-medium">{forChannels ? "Channels" : "Groups"}</h4>
      <div className="space-y-2.5">
        {visible.map((r) => (
          <label key={r.key} className="flex items-center justify-between gap-3 text-sm">
            {r.label}
            <Switch
              checked={Boolean(rights[r.key])}
              onCheckedChange={(checked) => setRights((prev) => ({ ...prev, [r.key]: checked }))}
            />
          </label>
        ))}
      </div>
      <Button className="mt-4" size="sm" onClick={save} loading={saving}>
        Save {forChannels ? "channel" : "group"} rights
      </Button>
    </div>
  );
}

/** Default admin rights Telegram suggests when someone adds the bot as an administrator. */
export function AdminRightsCard({ bot }: { bot: BotDetail }) {
  const [data, setData] = useState<{ groups: ChatAdministratorRights; channels: ChatAdministratorRights } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    apiFetch<{ groups: ChatAdministratorRights; channels: ChatAdministratorRights }>(`/api/bots/${bot.id}/admin-rights`)
      .then(setData)
      .catch(() => setFailed(true));
  }, [bot.id]);

  return (
    <Card>
      <h3 className="mb-1 text-sm font-semibold">Default administrator rights</h3>
      <p className="mb-4 text-xs text-[var(--muted)]">
        Suggested to users when they add this bot as an admin. They can still change them.
      </p>
      {failed ? (
        <p className="text-sm text-[var(--danger)]">Couldn&apos;t load the default rights.</p>
      ) : data === null ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="grid gap-8 sm:grid-cols-2">
          <RightsColumn botId={bot.id} forChannels={false} initial={data.groups} />
          <RightsColumn botId={bot.id} forChannels initial={data.channels} />
        </div>
      )}
    </Card>
  );
}
