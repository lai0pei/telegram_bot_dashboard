"use client";

import { ArrowLeft, Download, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api-client";
import type { BotRights } from "@/lib/bot-chats";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { ProfilePhotoCard } from "../../profile-photo-card";
import type { BotDetail } from "./types";

type ChatType = "group" | "supergroup" | "channel";
type Status = "member" | "administrator" | "left" | "kicked";

interface TrackedChat {
  chatId: string;
  type: ChatType;
  title: string;
  username: string | null;
  status: Status;
  rights: BotRights | null;
  updatedAt: string;
  /** People waiting to join through an approval-required link. */
  pendingRequests?: number;
}

interface ChatInfo {
  chatId: string;
  type: ChatType;
  title: string;
  username: string | null;
  description: string;
  inviteLink: string | null;
  memberCount: number | null;
  status: Status;
  rights: BotRights;
  admins: { userId: string; name: string; username: string | null; status: string }[];
}

const TYPE_LABELS: Record<ChatType, string> = { group: "Group", supergroup: "Supergroup", channel: "Channel" };
const STATUS_LABELS: Record<Status, string> = {
  member: "Member",
  administrator: "Admin",
  left: "Left",
  kicked: "Removed",
};

const photoUrl = (botId: number, chatId: string, version = 0) =>
  `/api/bots/${botId}/contacts/${encodeURIComponent(chatId)}/photo?v=${version}`;

export function ChatsTab({ bot }: { bot: BotDetail }) {
  const [chats, setChats] = useState<TrackedChat[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState<"add" | "import" | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<{ chats: TrackedChat[] }>(`/api/bots/${bot.id}/chats`);
      setChats(result.chats);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load chats.");
      setChats((prev) => prev ?? []);
    }
  }, [bot.id]);

  useEffect(() => {
    // Intentional: fetch-on-mount into local state, not state synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!adding.trim()) return;
    setBusy("add");
    try {
      const { chatId } = await apiFetch<{ chatId: string }>(`/api/bots/${bot.id}/chats`, { body: { chat: adding.trim() } });
      setAdding("");
      await load();
      setSelected(chatId);
      toast.success("Chat added.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add the chat.");
    } finally {
      setBusy(null);
    }
  }

  async function handleImport() {
    setBusy("import");
    try {
      const result = await apiFetch<{ checked: number; found: number; skipped: number; note: string | null }>(
        `/api/bots/${bot.id}/chats/import`,
        { method: "POST" }
      );
      await load();
      const extra = result.skipped > 0 ? ` ${result.skipped} more were not checked.` : "";
      toast.success(`Checked ${result.checked} of your chats: the bot is in ${result.found}.${extra}`);
      if (result.note) toast.info(result.note);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(null);
    }
  }

  const selectedChat = chats?.find((c) => c.chatId === selected) ?? null;

  return (
    <Card className="grid h-[calc(100dvh-16.5rem)] min-h-[460px] grid-cols-1 overflow-hidden p-0 md:grid-cols-[300px_1fr]">
      <div className={cn("flex min-h-0 flex-col border-[var(--card-border)] md:border-r", selected && "hidden md:flex")}>
        <div className="space-y-2 p-2">
          <form onSubmit={handleAdd} className="flex gap-2">
            <Input
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              placeholder="Chat ID or @username"
              className="h-9"
              aria-label="Chat ID or @username to add"
            />
            <Button type="submit" size="sm" loading={busy === "add"} disabled={!adding.trim() || busy !== null} aria-label="Add chat">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </form>
          <Button type="button" variant="outline" size="sm" className="w-full" loading={busy === "import"} disabled={busy !== null} onClick={() => void handleImport()}>
            <Download className="h-3.5 w-3.5" />
            Import from my channels &amp; groups
          </Button>
          <p className="text-[11px] text-[var(--muted)]">
            Telegram can&apos;t list a bot&apos;s chats. They show up here when the bot is added (with monitoring on), or add/import them.
          </p>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {chats === null ? (
            <li className="space-y-2 p-3">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </li>
          ) : chats.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-[var(--muted)]">No chats yet.</li>
          ) : (
            chats.map((c) => (
              <li key={c.chatId}>
                <button
                  type="button"
                  onClick={() => setSelected(c.chatId)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5",
                    selected === c.chatId && "bg-[var(--primary)]/10"
                  )}
                >
                  <Avatar src={photoUrl(bot.id, c.chatId)} name={c.title} className="h-9 w-9" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.title}</span>
                    <span className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                      {TYPE_LABELS[c.type]} · {STATUS_LABELS[c.status]} · {timeAgo(new Date(c.updatedAt).getTime())}
                    </span>
                  </span>
                  {Boolean(c.pendingRequests) && <Badge variant="primary">{c.pendingRequests} waiting</Badge>}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      {selectedChat ? (
        <ChatDetailPane
          key={selectedChat.chatId}
          bot={bot}
          chat={selectedChat}
          onBack={() => setSelected(null)}
          onChanged={() => void load()}
        />
      ) : (
        <div className="hidden items-center justify-center p-6 text-center text-sm text-[var(--muted)] md:flex">
          Select a chat to manage it as @{bot.username}.
        </div>
      )}
    </Card>
  );
}

function ChatDetailPane({
  bot,
  chat,
  onBack,
  onChanged,
}: {
  bot: BotDetail;
  chat: TrackedChat;
  onBack: () => void;
  onChanged: () => void;
}) {
  const base = `/api/bots/${bot.id}/chats/${encodeURIComponent(chat.chatId)}`;
  const [info, setInfo] = useState<ChatInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoVersion, setPhotoVersion] = useState(0);

  const load = useCallback(async () => {
    try {
      setInfo(await apiFetch<ChatInfo>(base));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the chat.");
    }
  }, [base]);

  useEffect(() => {
    // Intentional: fetch-on-mount into local state, not state synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const rights = info?.rights ?? chat.rights;

  return (
    <div className="flex min-h-0 flex-col overflow-y-auto">
      <div className="flex items-center gap-2 border-b border-[var(--card-border)] px-3 py-2">
        <Button type="button" variant="ghost" size="icon" className="md:hidden" onClick={onBack} aria-label="Back to chats">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Avatar src={photoUrl(bot.id, chat.chatId, photoVersion)} name={chat.title} className="h-9 w-9" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{info?.title ?? chat.title}</div>
          <div className="flex items-center gap-1 font-mono text-xs text-[var(--muted)]">
            {chat.chatId}
            <CopyButton value={chat.chatId} />
          </div>
        </div>
        <Badge>{TYPE_LABELS[chat.type]}</Badge>
        <Badge variant={chat.status === "administrator" ? "primary" : undefined}>{STATUS_LABELS[info?.status ?? chat.status]}</Badge>
      </div>

      {error ? (
        <p className="p-4 text-sm text-[var(--danger)]">{error}</p>
      ) : info === null ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-16" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <div className="space-y-4 p-4">
          <p className="text-xs text-[var(--muted)]">
            {info.memberCount !== null ? `${info.memberCount} member${info.memberCount === 1 ? "" : "s"}` : "Member count unavailable"}
            {info.username ? ` · @${info.username}` : " · private"}
          </p>
          <EditSection base={base} info={info} canChange={Boolean(rights?.canChangeInfo)} onSaved={() => { void load(); onChanged(); }} />
          <ProfilePhotoCard
            endpoint={`${base}/photo`}
            name={info.title}
            photoSrc={photoUrl(bot.id, chat.chatId, photoVersion)}
            disabledReason={rights?.canChangeInfo ? undefined : 'The bot needs the "change info" admin right to change the photo.'}
            onChanged={() => setPhotoVersion((v) => v + 1)}
          />
          <InviteSection base={base} info={info} canInvite={Boolean(rights?.canInviteUsers)} onChanged={() => void load()} />
          <JoinRequestsSection base={base} canInvite={Boolean(rights?.canInviteUsers)} onHandled={onChanged} />
          <MembersSection base={base} info={info} rights={rights} botTelegramId={bot.info?.id} />
          <LeaveSection base={base} onLeft={() => { onChanged(); onBack(); }} />
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-sm font-semibold">{children}</h4>;
}

function EditSection({ base, info, canChange, onSaved }: { base: string; info: ChatInfo; canChange: boolean; onSaved: () => void }) {
  const [title, setTitle] = useState(info.title);
  const [description, setDescription] = useState(info.description);
  const [saving, setSaving] = useState(false);
  const titleError = title.trim().length < 1 || title.length > 128 ? "Title must be 1–128 characters." : null;
  const descriptionError = description.length > 255 ? "Description must be at most 255 characters." : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (titleError || descriptionError) return;
    const body: Record<string, string> = {};
    if (title.trim() !== info.title) body.title = title.trim();
    if (description !== info.description) body.description = description;
    if (Object.keys(body).length === 0) {
      toast.info("Nothing to save.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch(base, { method: "PATCH", body });
      toast.success("Chat updated.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-2">
      <SectionTitle>Details</SectionTitle>
      {!canChange && <p className="text-xs text-[var(--muted)]">The bot needs the &quot;change info&quot; admin right to edit these.</p>}
      <div className="space-y-1.5">
        <Label htmlFor="chat-title">Title</Label>
        <Input id="chat-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={128} disabled={!canChange} />
        {titleError && <p className="text-xs text-[var(--danger)]">{titleError}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="chat-desc">Description</Label>
        <Textarea
          rows={5}
          id="chat-desc"
          maxLength={255}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!canChange}
        />
        {descriptionError && <p className="text-xs text-[var(--danger)]">{descriptionError}</p>}
      </div>
      <Button type="submit" size="sm" loading={saving} disabled={!canChange || Boolean(titleError || descriptionError)}>
        Save changes
      </Button>
    </form>
  );
}

function InviteSection({ base, info, canInvite, onChanged }: { base: string; info: ChatInfo; canInvite: boolean; onChanged: () => void }) {
  const [links, setLinks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmExport, setConfirmExport] = useState(false);
  const [requireApproval, setRequireApproval] = useState(false);

  async function run(action: "export" | "create", link?: string) {
    setBusy(true);
    try {
      if (link) {
        await apiFetch(`${base}/invite`, { body: { action: "revoke", link } });
        setLinks((prev) => prev.filter((l) => l !== link));
        toast.success("Link revoked.");
      } else {
        const result = await apiFetch<{ link: string }>(`${base}/invite`, {
          body: { action, ...(action === "create" && requireApproval && { createsJoinRequest: true }) },
        });
        setLinks((prev) => [result.link, ...prev]);
        toast.success(action === "export" ? "New primary link created; the old one stopped working." : "Invite link created.");
        if (action === "export") onChanged();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invite link action failed.");
    } finally {
      setBusy(false);
      setConfirmExport(false);
    }
  }

  const shown = [...(info.inviteLink ? [info.inviteLink] : []), ...links.filter((l) => l !== info.inviteLink)];

  return (
    <div className="space-y-2">
      <SectionTitle>Invite links</SectionTitle>
      {!canInvite && <p className="text-xs text-[var(--muted)]">The bot needs the &quot;invite users&quot; admin right to manage links.</p>}
      <ul className="space-y-1">
        {shown.length === 0 && <li className="text-xs text-[var(--muted)]">No link to show yet. Create one below.</li>}
        {shown.map((link) => (
          <li key={link} className="flex items-center gap-1 text-xs">
            <span className="min-w-0 flex-1 truncate font-mono">{link}</span>
            <CopyButton value={link} />
            <Button type="button" variant="ghost" size="sm" disabled={!canInvite || busy} onClick={() => void run("create", link)}>
              Revoke
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={!canInvite || busy} onClick={() => void run("create")}>
          New link
        </Button>
        <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <input type="checkbox" checked={requireApproval} onChange={(e) => setRequireApproval(e.target.checked)} />
          Require approval to join
        </label>
        {confirmExport ? (
          <>
            <Button type="button" variant="danger" size="sm" loading={busy} onClick={() => void run("export")}>
              Replace primary link
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmExport(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button type="button" variant="ghost" size="sm" disabled={!canInvite || busy} onClick={() => setConfirmExport(true)}>
            Replace primary link…
          </Button>
        )}
      </div>
    </div>
  );
}

interface JoinRequest {
  userId: string;
  username: string | null;
  firstName: string | null;
  bio: string | null;
  requestedAt: string;
}

/** Pending requests from approval-required invite links. Only requests seen while monitoring was on are listed. */
function JoinRequestsSection({ base, canInvite, onHandled }: { base: string; canInvite: boolean; onHandled: () => void }) {
  const [requests, setRequests] = useState<JoinRequest[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<{ requests: JoinRequest[] }>(`${base}/join-requests`);
      setRequests(result.requests);
    } catch {
      setRequests([]);
    }
  }, [base]);

  useEffect(() => {
    // Intentional: fetch-on-mount into local state, not state synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function handle(userId: string, action: "approve" | "decline") {
    setBusyId(userId);
    try {
      await apiFetch(`${base}/join-requests`, { body: { userId, action } });
      toast.success(action === "approve" ? "Approved." : "Declined.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusyId(null);
      await load();
      onHandled();
    }
  }

  return (
    <div className="space-y-2">
      <SectionTitle>Join requests</SectionTitle>
      {requests === null ? (
        <Skeleton className="h-10" />
      ) : requests.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">
          Nobody is waiting. Create a link with &ldquo;Require approval to join&rdquo; above; requests are collected while monitoring is on.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--card-border)]">
          {requests.map((r) => (
            <li key={r.userId} className="flex items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {r.firstName ?? r.userId}
                  {r.username ? ` (@${r.username})` : ""}
                </span>
                <span className="block truncate text-xs text-[var(--muted)]">
                  {r.bio ? `${r.bio} · ` : ""}asked {timeAgo(new Date(r.requestedAt).getTime())}
                </span>
              </span>
              <Button type="button" size="sm" disabled={!canInvite || busyId === r.userId} onClick={() => void handle(r.userId, "approve")}>
                Approve
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={!canInvite || busyId === r.userId} onClick={() => void handle(r.userId, "decline")}>
                Decline
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const MEMBER_ACTIONS: { value: string; label: string; right: keyof BotRights; destructive: boolean }[] = [
  { value: "ban", label: "Ban", right: "canRestrictMembers", destructive: true },
  { value: "unban", label: "Unban", right: "canRestrictMembers", destructive: false },
  { value: "restrict", label: "Make read-only", right: "canRestrictMembers", destructive: true },
  { value: "unrestrict", label: "Allow messages again", right: "canRestrictMembers", destructive: false },
  { value: "promote", label: "Promote to admin", right: "canPromoteMembers", destructive: true },
  { value: "demote", label: "Remove admin", right: "canPromoteMembers", destructive: true },
];

function MembersSection({
  base,
  info,
  rights,
  botTelegramId,
}: {
  base: string;
  info: ChatInfo;
  rights: BotRights | null;
  botTelegramId?: number;
}) {
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState(MEMBER_ACTIONS[0].value);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [duration, setDuration] = useState("");
  const [revokeMessages, setRevokeMessages] = useState(false);

  const selected = MEMBER_ACTIONS.find((a) => a.value === action)!;
  const allowed = Boolean(rights?.[selected.right]);
  const userIdError = userId && !/^\d{1,15}$/.test(userId.trim()) ? "Enter a numeric Telegram user ID." : null;
  const isBot = userId.trim() !== "" && botTelegramId !== undefined && userId.trim() === String(botTelegramId);

  async function run() {
    setBusy(true);
    try {
      await apiFetch(`${base}/members`, {
        body: {
          userId: userId.trim(),
          action,
          ...(action === "restrict" && duration && { duration }),
          ...(action === "ban" && revokeMessages && { revokeMessages: true }),
        },
      });
      toast.success(`${selected.label}: done.`);
      setConfirming(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <SectionTitle>Members</SectionTitle>
      <p className="text-xs text-[var(--muted)]">
        Admins: {info.admins.length === 0 ? "none visible" : info.admins.map((a) => a.name + (a.username ? ` (@${a.username})` : "")).join(", ")}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={userId}
          onChange={(e) => { setUserId(e.target.value); setConfirming(false); }}
          placeholder="User ID"
          className="h-9 w-40"
          aria-label="Telegram user ID"
          aria-invalid={Boolean(userIdError)}
        />
        <select
          value={action}
          onChange={(e) => { setAction(e.target.value); setConfirming(false); }}
          aria-label="Action"
          className="h-9 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-2 text-sm"
        >
          {MEMBER_ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
        {confirming ? (
          <>
            <Button type="button" variant="danger" size="sm" loading={busy} onClick={() => void run()}>
              Confirm {selected.label.toLowerCase()}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!userId.trim() || Boolean(userIdError) || isBot || !allowed || busy}
            onClick={() => (selected.destructive ? setConfirming(true) : void run())}
          >
            Apply
          </Button>
        )}
      </div>
      {action === "restrict" && (
        <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
          For
          <select
            value={duration}
            onChange={(e) => { setDuration(e.target.value); setConfirming(false); }}
            aria-label="How long"
            className="h-8 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-2 text-xs"
          >
            <option value="">Until I allow messages again</option>
            <option value="1h">1 hour</option>
            <option value="1d">1 day</option>
            <option value="1w">1 week</option>
          </select>
        </label>
      )}
      {action === "ban" && (
        <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <input type="checkbox" checked={revokeMessages} onChange={(e) => { setRevokeMessages(e.target.checked); setConfirming(false); }} />
          Also delete their messages
        </label>
      )}
      {userIdError && <p className="text-xs text-[var(--danger)]">{userIdError}</p>}
      {isBot && <p className="text-xs text-[var(--danger)]">That&apos;s the bot itself.</p>}
      {!allowed && <p className="text-xs text-[var(--muted)]">The bot doesn&apos;t have the admin right this action needs.</p>}
    </div>
  );
}

function LeaveSection({ base, onLeft }: { base: string; onLeft: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function leave() {
    setBusy(true);
    try {
      await apiFetch(`${base}/leave`, { method: "POST" });
      toast.success("The bot left the chat.");
      onLeft();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to leave.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-[var(--card-border)] pt-4">
      <SectionTitle>Leave this chat</SectionTitle>
      <p className="text-xs text-[var(--muted)]">The bot leaves; someone has to add it back to rejoin.</p>
      {confirming ? (
        <div className="flex gap-2">
          <Button type="button" variant="danger" size="sm" loading={busy} onClick={() => void leave()}>
            Leave chat
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(true)}>
          Leave…
        </Button>
      )}
    </div>
  );
}
