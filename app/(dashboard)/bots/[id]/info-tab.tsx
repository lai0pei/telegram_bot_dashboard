"use client";

import { Briefcase, Copy, ExternalLink, Eye, EyeOff, HeartPulse, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/api-client";
import { validateBotToken } from "@/lib/validation";
import { FEEDBACK_PERCENTAGES, hasUnconfirmedSettings, privacyOnFromInfo, validateSettingValue, type SettingKey, type SettingValue } from "@/lib/botfather-settings";
import { timeAgo } from "@/lib/time";
import type { BotDetail, BusinessConnectionInfo } from "./types";

/** The token with reveal/copy; revoking it lives next to it (Token & danger). */
export function TokenCard({ bot, onFetchToken, fetchingToken, onChange }: { bot: BotDetail; onFetchToken: () => void; fetchingToken: boolean; onChange: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const [newToken, setNewToken] = useState("");
  const [replacing, setReplacing] = useState(false);
  const token = bot.token;
  const tokenBot = bot.source === "token";
  const tokenError = newToken ? validateBotToken(newToken) : null;

  async function replaceToken() {
    setReplacing(true);
    try {
      await apiFetch(`/api/bots/${bot.id}/token`, { method: "PUT", body: { token: newToken.trim() } });
      toast.success("Token replaced.");
      setNewToken("");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to replace the token.");
    } finally {
      setReplacing(false);
    }
  }

  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold">Bot token</h3>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <code className="flex-1 truncate rounded-md bg-black/5 px-3 py-2 text-sm dark:bg-white/5">
          {token && revealed ? token : "••••••••••••••••••••••••"}
        </code>
        <div className="flex gap-2">
          {!token ? (
            // A bot added by token has no BotFather chat to fetch from: its owner has to hand over a new token.
            tokenBot ? null : (
              <Button size="sm" variant="outline" onClick={onFetchToken} loading={fetchingToken}>
                Fetch from BotFather
              </Button>
            )
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setRevealed((r) => !r)}>
                {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {revealed ? "Hide" : "Reveal"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(token);
                  toast.success("Copied.");
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </Button>
            </>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]">Anyone with this token has full control of the bot. Keep it secret.</p>
      {tokenBot && (
        <div className="mt-4 space-y-2 border-t border-[var(--card-border)] pt-4">
          <h4 className="text-sm font-medium">Replace token</h4>
          <p className="text-xs text-[var(--muted)]">
            If the bot&apos;s owner revoked or changed the token, ask them for the current one and paste it here. It has to be the same bot (@{bot.username}).
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="password"
              value={newToken}
              onChange={(e) => setNewToken(e.target.value)}
              placeholder="123456789:AAH…"
              aria-label="New bot token"
              autoComplete="off"
              spellCheck={false}
            />
            <Button size="sm" variant="outline" onClick={() => void replaceToken()} loading={replacing} disabled={!newToken || Boolean(tokenError)}>
              Replace
            </Button>
          </div>
          {tokenError && <p className="text-xs text-[var(--danger)]">{tokenError}</p>}
        </div>
      )}
    </Card>
  );
}

/** Last background health check, with a manual re-check. */
export function HealthCard({ bot, onChange }: { bot: BotDetail; onChange: () => void }) {
  const [checking, setChecking] = useState(false);

  async function checkHealth() {
    setChecking(true);
    try {
      await apiFetch(`/api/bots/${bot.id}/health`, { method: "POST" });
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Health check failed.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <HeartPulse className="h-4 w-4" aria-hidden />
          Health
        </h3>
        {bot.health && (
          <Badge variant={bot.health.status === "ok" ? "success" : bot.health.status === "error" ? "danger" : "default"}>
            {bot.health.status === "ok" ? "Healthy" : bot.health.status === "error" ? "Needs attention" : "Warning"}
          </Badge>
        )}
      </div>
      <p className="text-sm text-[var(--muted)]">
        {bot.health
          ? (bot.health.message ?? "The token works and updates are being delivered.")
          : "Not checked yet. Bots with a token are checked every 10 minutes."}
        {bot.health?.checkedAt && ` Checked ${timeAgo(new Date(bot.health.checkedAt).getTime())}.`}
      </p>
      {bot.hasToken && (
        <Button className="mt-3" size="sm" variant="outline" onClick={checkHealth} loading={checking}>
          Check now
        </Button>
      )}
    </Card>
  );
}

export function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}

type BotInfo = NonNullable<BotDetail["info"]>;

/**
 * The bot's own switches. They can only be changed in @BotFather (no Bot API method), so the controls here drive
 * BotFather's chat for you and then re-read getMe. Business mode and the main Mini App stay read-only.
 */
export function CapabilitiesCard({ bot, info, onChange }: { bot: BotDetail; info: BotInfo; onChange: () => void }) {
  const [busy, setBusy] = useState<SettingKey | null>(null);
  const [placeholder, setPlaceholder] = useState("");
  const [feedback, setFeedback] = useState<number>(100);
  const [domain, setDomain] = useState("");
  // Settings Telegram can't read back: what was last sent from here this session (never stored).
  const [lastSent, setLastSent] = useState<Partial<Record<SettingKey, string>>>({});

  async function apply(key: SettingKey, value: SettingValue, describe?: string) {
    setBusy(key);
    try {
      const result = await apiFetch<{ verified: boolean }>(`/api/bots/${bot.id}/botfather-settings`, {
        method: "PATCH",
        body: { setting: key, value },
      });
      if (result.verified) toast.success("Done, and Telegram confirms it.");
      else {
        toast.success("Sent to BotFather. Telegram can't confirm this one.");
        if (describe) setLastSent((prev) => ({ ...prev, [key]: describe }));
      }
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "BotFather change failed.");
    } finally {
      setBusy(null);
    }
  }

  const locked = busy !== null;
  const unknown = <span className="text-xs text-[var(--muted)]">Not reported</span>;
  const readOnly: { label: string; on: boolean | undefined; onText: string; offText: string; command: string }[] = [
    {
      label: "Business connections",
      on: info.can_connect_to_business,
      onText: "Telegram Business users can connect this bot to their account.",
      offText: "The bot can't be connected to Business accounts.",
      command: "/mybots → Bot Settings → Business Mode",
    },
    {
      label: "Main Mini App",
      on: info.has_main_web_app,
      onText: "The bot has a main Mini App.",
      offText: "No main Mini App is set.",
      command: "/myapps",
    },
  ];

  return (
    <Card>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          Capabilities
        </h3>
        <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:underline">
          Open BotFather <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </div>
      <p className="mb-3 text-xs text-[var(--muted)]">
        These switches talk to @BotFather for you, which takes a few seconds. If BotFather&apos;s wording differs from what the dashboard expects, it stops and shows what BotFather said.
        {hasUnconfirmedSettings && " Not yet checked against BotFather's real replies, so try a change on a throwaway bot first."}
      </p>
      {bot.source === "token" && (
        <p className="mb-3 rounded-md bg-black/5 px-3 py-2 text-xs dark:bg-white/5">
          Only the bot&apos;s owner can change these (they talk to @BotFather as the owner). Ask them, or do it in BotFather yourself.
        </p>
      )}
      {/* A disabled fieldset disables every native control inside it, so the BotFather switches stay visible but inert for a bot added by token. */}
      <fieldset disabled={bot.source === "token"} className="m-0 min-w-0 border-0 p-0">
      <ul className="space-y-4 text-sm">
        <li className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium">Can be added to groups</div>
            <p className="text-xs text-[var(--muted)]">{info.can_join_groups ? "Anyone can add the bot to a group." : "The bot can't be added to groups."}</p>
          </div>
          {info.can_join_groups === undefined ? unknown : (
            <Switch checked={info.can_join_groups} disabled={locked} onCheckedChange={(v) => void apply("joinGroups", v)} aria-label="Can be added to groups" />
          )}
        </li>
        <li className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium">Privacy mode</div>
            <p className="text-xs text-[var(--muted)]">
              {info.can_read_all_group_messages === undefined
                ? "Not reported by Telegram."
                : privacyOnFromInfo(info)
                  ? "On: in groups the bot only sees commands, replies to it and mentions, so other group messages won't appear under Messages."
                  : "Off: in groups the bot sees every message."}
            </p>
          </div>
          {info.can_read_all_group_messages === undefined ? unknown : (
            <Switch checked={privacyOnFromInfo(info)} disabled={locked} onCheckedChange={(v) => void apply("privacy", v)} aria-label="Privacy mode" />
          )}
        </li>
        <li className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium">Inline mode</div>
              <p className="text-xs text-[var(--muted)]">
                {info.supports_inline_queries ? "Users can type the bot's @username in any chat to query it." : "Inline queries are off."}
              </p>
            </div>
            {info.supports_inline_queries ? (
              <Switch checked disabled={locked} onCheckedChange={() => void apply("inline", null)} aria-label="Inline mode" />
            ) : (
              <Badge>Off</Badge>
            )}
          </div>
          {!info.supports_inline_queries && (
            <div className="flex gap-2">
              <input
                value={placeholder}
                onChange={(e) => setPlaceholder(e.target.value)}
                maxLength={64}
                placeholder="Placeholder shown in the input, e.g. Search cats"
                aria-label="Inline placeholder"
                className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-2 text-xs"
              />
              <Button size="sm" variant="outline" loading={busy === "inline"} disabled={locked || Boolean(validateSettingValue("inline", placeholder.trim()))} onClick={() => void apply("inline", placeholder.trim())}>
                Turn on
              </Button>
            </div>
          )}
        </li>
        {readOnly.map((row) => (
          <li key={row.label} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium">{row.label}</div>
              <p className="text-xs text-[var(--muted)]">
                {row.on === undefined ? "Not reported by Telegram." : row.on ? row.onText : row.offText}{" "}
                <span>
                  Change in BotFather: <code>{row.command}</code>
                </span>
              </p>
            </div>
            <Badge variant={row.on ? "success" : "default"}>{row.on === undefined ? "Unknown" : row.on ? "On" : "Off"}</Badge>
          </li>
        ))}
      </ul>
      </fieldset>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-medium">Advanced (not confirmed by Telegram)</summary>
        <p className="mt-1 text-xs text-[var(--muted)]">Telegram doesn&apos;t report these back, so the dashboard can only pass them to BotFather. What was last sent from here this session is shown below each.</p>
        <div className="mt-3 space-y-4">
          <div className="space-y-1.5">
            <div className="font-medium">Inline feedback</div>
            <p className="text-xs text-[var(--muted)]">Needed for the &ldquo;chosen&rdquo; counts on inline results. Share of picked results Telegram reports back.</p>
            <div className="flex gap-2">
              <select value={feedback} onChange={(e) => setFeedback(Number(e.target.value))} aria-label="Inline feedback percentage" className="h-8 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-2 text-xs">
                {FEEDBACK_PERCENTAGES.map((p) => (
                  <option key={p} value={p}>
                    {p}%
                  </option>
                ))}
              </select>
              <Button size="sm" variant="outline" loading={busy === "inlineFeedback"} disabled={locked} onClick={() => void apply("inlineFeedback", feedback, `${feedback}%`)}>
                Apply
              </Button>
            </div>
            {lastSent.inlineFeedback && <p className="text-xs text-[var(--muted)]">Last sent: {lastSent.inlineFeedback}</p>}
          </div>
          <div className="space-y-1.5">
            <div className="font-medium">Ask for location in inline mode</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" loading={busy === "inlineGeo"} disabled={locked} onClick={() => void apply("inlineGeo", true, "on")}>
                Enable
              </Button>
              <Button size="sm" variant="ghost" disabled={locked} onClick={() => void apply("inlineGeo", false, "off")}>
                Disable
              </Button>
            </div>
            {lastSent.inlineGeo && <p className="text-xs text-[var(--muted)]">Last sent: {lastSent.inlineGeo}</p>}
          </div>
          <div className="space-y-1.5">
            <div className="font-medium">Login widget domain</div>
            <div className="flex gap-2">
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="example.com"
                aria-label="Login domain"
                className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-2 text-xs"
              />
              <Button size="sm" variant="outline" loading={busy === "domain"} disabled={locked || Boolean(validateSettingValue("domain", domain.trim()))} onClick={() => void apply("domain", domain.trim(), domain.trim())}>
                Set
              </Button>
              <Button size="sm" variant="ghost" disabled={locked} onClick={() => void apply("domain", null, "removed")}>
                Remove
              </Button>
            </div>
            {lastSent.domain && <p className="text-xs text-[var(--muted)]">Last sent: {lastSent.domain}</p>}
          </div>
        </div>
      </details>
    </Card>
  );
}

const RIGHT_LABELS: [string, string][] = [
  ["can_reply", "Reply"],
  ["can_read_messages", "Mark as read"],
  ["can_delete_sent_messages", "Delete its own messages"],
  ["can_delete_all_messages", "Delete any message"],
  ["can_edit_name", "Edit name"],
  ["can_edit_bio", "Edit bio"],
  ["can_edit_profile_photo", "Edit photo"],
  ["can_edit_username", "Edit username"],
];

/**
 * Telegram Business accounts that connected this bot. The Bot API can't list them, so this shows what the poller
 * recorded: connections made while monitoring was on. Their chats appear under Messages with a Business badge.
 */
export function BusinessCard({ bot }: { bot: BotDetail }) {
  const [connections, setConnections] = useState<BusinessConnectionInfo[] | null>(null);

  useEffect(() => {
    apiFetch<{ connections: BusinessConnectionInfo[] }>(`/api/bots/${bot.id}/business`)
      .then((r) => setConnections(r.connections))
      .catch(() => setConnections([]));
  }, [bot.id]);

  const canConnect = bot.info?.can_connect_to_business;
  if (connections === null || (!connections.length && !canConnect)) return null;

  return (
    <Card>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Briefcase className="h-4 w-4" aria-hidden />
        Business accounts
      </h3>
      {connections.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          No account has connected this bot yet. In Telegram: Settings → Business → Chatbots, then pick @{bot.username}.
          {!bot.monitorEnabled && " Turn monitoring on first, so the dashboard can see the connection."}
        </p>
      ) : (
        <ul className="space-y-3 text-sm">
          {connections.map((c) => (
            <li key={c.connectionId}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{c.userName}</span>
                <Badge variant={c.isEnabled ? "success" : "default"}>{c.isEnabled ? "Active" : "Disabled"}</Badge>
              </div>
              <p className="mt-1 flex flex-wrap gap-1 text-xs">
                {RIGHT_LABELS.filter(([key]) => c.rights[key]).map(([key, label]) => (
                  <Badge key={key}>{label}</Badge>
                ))}
                {!RIGHT_LABELS.some(([key]) => c.rights[key]) && <span className="text-[var(--muted)]">No permissions granted.</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
