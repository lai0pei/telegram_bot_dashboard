"use client";

import { ArrowLeft, KeyRound, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { BotSummary } from "../../bot-card";
import { MonitorToggle } from "./monitor-toggle";
import { SECTIONS, sectionGroupsFor, type SectionId } from "./sections";
import type { BotDetail } from "./types";

const HEALTH_LABEL = { ok: "Healthy", warning: "Warning", error: "Needs attention" } as const;

/**
 * The bot page frame: a compact header (switcher + status chips) and, from `lg` up, a section bar of group dropdowns
 * (Build ▾ Engage ▾ …) above a full-width content area. Neither is sticky, so the `top-6` sticky cards keep working.
 * Below `lg` the bar becomes a section picker.
 */
export function BotShell({
  bot,
  section,
  onSection,
  photoSrc,
  onReload,
  reloading,
  onFetchToken,
  fetchingToken,
  badges,
  children,
}: {
  bot: BotDetail;
  section: SectionId;
  onSection: (id: SectionId) => void;
  photoSrc: string;
  onReload: () => void;
  reloading: boolean;
  onFetchToken: () => void;
  fetchingToken: boolean;
  /** Small counts/dots by section id, shown in the sidebar. */
  badges: Partial<Record<SectionId, string>>;
  children: React.ReactNode;
}) {
  const groups = sectionGroupsFor(bot.source);
  return (
    <div className="space-y-4">
      <BotHeader
        bot={bot}
        section={section}
        photoSrc={photoSrc}
        onReload={onReload}
        reloading={reloading}
        onFetchToken={onFetchToken}
        fetchingToken={fetchingToken}
        onSection={onSection}
      />

      <div className="lg:hidden">
        <select
          value={section}
          onChange={(e) => onSection(e.target.value as SectionId)}
          aria-label="Section"
          className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm"
        >
          {groups.map((g) => (
            <optgroup key={g.label ?? "main"} label={g.label ?? "Bot"}>
              {g.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {badges[s.id] ? `${s.label} (${badges[s.id]})` : s.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <nav aria-label="Bot sections" className="hidden flex-wrap items-center gap-1 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-1 lg:flex">
        {groups.map((g) => {
          const inGroup = g.sections.some((s) => s.id === section);
          const groupBadge = g.sections.some((s) => badges[s.id]);
          // A group with one section (Overview, Token & danger) is a plain button; the others open a list.
          if (g.sections.length === 1) {
            const { id, label, icon: Icon } = g.sections[0];
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSection(id)}
                aria-current={section === id ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                  section === id ? "bg-[var(--primary)]/10 font-medium text-[var(--primary)]" : "text-[var(--muted)] hover:bg-black/5 hover:text-[var(--foreground)] dark:hover:bg-white/5"
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
                {badges[id] && <span className="rounded-full bg-black/5 px-1.5 text-[11px] tabular-nums dark:bg-white/10">{badges[id]}</span>}
              </button>
            );
          }
          return (
            <DropdownMenu
              key={g.label ?? "main"}
              active={inGroup}
              value={section}
              onSelect={(id) => onSection(id as SectionId)}
              items={g.sections.map(({ id, label, icon }) => ({ id, label, icon, badge: badges[id] }))}
            >
              {g.label}
              {inGroup && <span className="font-normal text-[var(--foreground)]">· {g.sections.find((s) => s.id === section)?.label}</span>}
              {!inGroup && groupBadge && <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" aria-label="Needs attention" />}
            </DropdownMenu>
          );
        })}
      </nav>

      <div className="min-w-0">{children}</div>
    </div>
  );
}

function BotHeader({
  bot,
  section,
  photoSrc,
  onReload,
  reloading,
  onFetchToken,
  fetchingToken,
  onSection,
}: {
  bot: BotDetail;
  section: SectionId;
  photoSrc: string;
  onReload: () => void;
  reloading: boolean;
  onFetchToken: () => void;
  fetchingToken: boolean;
  onSection: (id: SectionId) => void;
}) {
  const router = useRouter();
  const [bots, setBots] = useState<BotSummary[]>([]);

  useEffect(() => {
    apiFetch<{ bots: BotSummary[] }>("/api/bots")
      .then((r) => setBots(r.bots.slice().sort((a, b) => (a.firstName || a.username).localeCompare(b.firstName || b.username))))
      .catch(() => {});
  }, []);

  const health = bot.health;
  const webhookSet = Boolean(bot.webhook?.url);
  const label = SECTIONS.find((s) => s.id === section)?.label;

  return (
    <header className="space-y-2">
      <Link
        href="/bots"
        className="inline-flex items-center gap-1 text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Bots
      </Link>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar src={photoSrc} name={bot.username} className="h-10 w-10" />
          <div className="min-w-0">
            {bots.length > 1 ? (
              <select
                value={bot.id}
                onChange={(e) => router.push(`/bots/${e.target.value}?s=${section}`)}
                aria-label="Switch bot"
                className="max-w-full truncate rounded-md border border-transparent bg-transparent text-lg font-semibold hover:border-[var(--card-border)]"
              >
                {bots.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.firstName || `@${b.username}`}
                  </option>
                ))}
              </select>
            ) : (
              <h1 className="truncate text-lg font-semibold">{bot.firstName || `@${bot.username}`}</h1>
            )}
            <p className="truncate text-sm text-[var(--muted)]">
              @{bot.username}
              {label && section !== "overview" ? ` · ${label}` : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {health && (
            <Badge variant={health.status === "ok" ? "success" : health.status === "error" ? "danger" : "default"} title={health.message ?? undefined}>
              {HEALTH_LABEL[health.status]}
            </Badge>
          )}
          <Badge variant={webhookSet ? "primary" : "default"}>{webhookSet ? "Webhook" : "Polling"}</Badge>
          {bot.source === "token" && (
            <Badge variant="default" title="Added with its token. Photo, usernames and BotFather settings can only be changed by the bot's owner.">
              Added by token
            </Badge>
          )}
          {bot.hasToken ? (
            <Badge variant="default">
              <KeyRound className="mr-1 h-3 w-3" aria-hidden />
              Token stored
            </Badge>
          ) : bot.source === "token" ? (
            <button
              type="button"
              onClick={() => onSection("advanced")}
              className="rounded-full bg-[var(--danger)]/15 px-2 py-0.5 font-medium text-[var(--danger)] hover:underline"
            >
              No token — paste it
            </button>
          ) : (
            <button
              type="button"
              onClick={onFetchToken}
              disabled={fetchingToken}
              className="rounded-full bg-[var(--danger)]/15 px-2 py-0.5 font-medium text-[var(--danger)] hover:underline disabled:cursor-wait disabled:opacity-60"
            >
              {fetchingToken ? "Fetching from BotFather…" : "No token — fetch it"}
            </button>
          )}
          <label className="flex items-center gap-2 rounded-full bg-black/5 py-0.5 pl-2.5 pr-1 dark:bg-white/5">
            Monitoring
            <MonitorToggle bot={bot} onChange={onReload} />
          </label>
        </div>

        <Button variant="outline" size="sm" className="ml-auto" onClick={onReload} loading={reloading}>
          {!reloading && <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>
    </header>
  );
}
