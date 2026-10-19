"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Bot as BotIcon,
  ExternalLink,
  Eye,
  EyeOff,
  Megaphone,
  MessageSquare,
  Plus,
  QrCode,
  Radio,
  Star,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, InteractiveCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, getMe, type Me } from "@/lib/api-client";
import { FadeIn, Stagger, StaggerItem } from "@/components/motion";
import { AccountCardSkeleton } from "./loading";
import { useAccounts } from "./accounts-context";
import { NoActiveAccount, isNoActiveAccount } from "./no-active-account";
import { AttentionPanel } from "./attention-panel";
import { Sparkline } from "./sparkline";

interface TrendPoint {
  day: string;
  botUsersNew: number;
  botMessagesIn: number;
}

interface OverviewStats {
  bots: number;
  monitoredBots: number;
  channels: number;
  groups: number;
  botUsers: number;
  messagesToday: number;
  trend: TrendPoint[];
  recentMessages: {
    id: number;
    botId: number;
    botUsername: string;
    fromName: string;
    text: string | null;
    createdAt: number;
  }[];
}

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function timeAgo(ms: number): string {
  const seconds = Math.round((ms - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * The overview is about *you*: the active Telegram account's profile, a few
 * at-a-glance numbers (each linking to the filtered Bots / Channels list),
 * recent bot activity, and shortcuts. Bots and channels themselves live on
 * their own pages.
 */
export default function OverviewPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [noActiveAccount, setNoActiveAccount] = useState(false);

  useEffect(() => {
    // Loaded separately: /api/me talks to Telegram, /api/overview is a local DB read and returns instantly.
    getMe()
      .then(setMe)
      .catch((err) => {
        if (isNoActiveAccount(err)) setNoActiveAccount(true);
        else toast.error(err instanceof Error ? err.message : "Failed to load your account.");
      });
    apiFetch<OverviewStats>("/api/overview")
      .then(setStats)
      .catch((err) => {
        if (isNoActiveAccount(err)) setNoActiveAccount(true);
        else toast.error(err instanceof Error ? err.message : "Failed to load overview.");
      });
  }, []);

  if (noActiveAccount || me?.hasActiveAccount === false) return <NoActiveAccount />;

  return (
    <div className="space-y-6">
      <FadeIn>
        {/* Greeting only once loaded: it depends on the browser's clock, which server rendering doesn't have. */}
        <h1 className="text-lg font-semibold">
          {me ? `${greeting()}${me.firstName ? `, ${me.firstName}` : ""}` : "Overview"}
        </h1>
        <p className="text-sm text-[var(--muted)]">Here&apos;s what&apos;s happening with your Telegram account.</p>
      </FadeIn>

      {me ? <ProfileCard me={me} /> : <AccountCardSkeleton />}

      <AttentionPanel />

      <StatTiles stats={stats} />

      <div className="grid gap-6 lg:grid-cols-3">
        <RecentMessages stats={stats} className="lg:col-span-2" />
        <QuickActions />
      </div>
    </div>
  );
}

function ProfileCard({ me }: { me: Me }) {
  const { active, accounts } = useAccounts();
  const [photoFailed, setPhotoFailed] = useState(false);
  const [showPhone, setShowPhone] = useState(false);

  const name = [me.firstName, me.lastName].filter(Boolean).join(" ") || "—";
  const initial = (me.firstName || me.username || "?").charAt(0).toUpperCase();
  const linkedCount = accounts?.filter((a) => !a.revoked).length ?? 0;

  return (
    <FadeIn>
      <Card>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            {active && !photoFailed ? (
              // eslint-disable-next-line @next/next/no-img-element -- authenticated, per-account image from our own API
              <img
                src={`/api/me/photo?a=${active.id}`}
                alt=""
                className="h-16 w-16 shrink-0 rounded-full object-cover"
                onError={() => setPhotoFailed(true)}
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10 text-xl font-semibold text-[var(--primary)]">
                {initial}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-base font-semibold">{name}</span>
                {me.premium && (
                  <Badge variant="primary" className="gap-1">
                    <Star className="h-3 w-3" aria-hidden />
                    Premium
                  </Badge>
                )}
              </div>
              {me.username ? (
                <a
                  href={`https://t.me/${me.username}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--primary)]"
                >
                  @{me.username}
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              ) : (
                <span className="text-sm text-[var(--muted)]">No public username</span>
              )}
            </div>
          </div>

          <dl className="grid flex-1 grid-cols-2 gap-3 text-sm sm:grid-cols-3 sm:border-l sm:border-[var(--card-border)] sm:pl-5">
            <div>
              <dt className="text-xs text-[var(--muted)]">Telegram ID</dt>
              <dd className="flex items-center gap-1 font-mono">
                {me.chatId ?? "—"}
                {me.chatId && <CopyButton value={me.chatId} />}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">Phone</dt>
              <dd className="flex items-center gap-1">
                {me.phone ? (showPhone ? `+${me.phone}` : `+${me.phone.slice(0, 2)}${"•".repeat(Math.max(me.phone.length - 4, 3))}${me.phone.slice(-2)}`) : "—"}
                {me.phone && (
                  <button
                    type="button"
                    onClick={() => setShowPhone((v) => !v)}
                    aria-label={showPhone ? "Hide phone number" : "Show phone number"}
                    className="flex h-6 w-6 items-center justify-center rounded text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    {showPhone ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">Linked accounts</dt>
              <dd>
                <Link href="/telegram-accounts" className="hover:text-[var(--primary)]">
                  {linkedCount} {linkedCount === 1 ? "account" : "accounts"}
                </Link>
              </dd>
            </div>
          </dl>
        </div>
      </Card>
    </FadeIn>
  );
}

/** Sum of the last `n` days of a trend metric, used for the "+N this week" deltas. */
function sumLast(trend: TrendPoint[], n: number, pick: (p: TrendPoint) => number): number {
  return trend.slice(-n).reduce((total, p) => total + pick(p), 0);
}

function StatTiles({ stats }: { stats: OverviewStats | null }) {
  const trend = stats?.trend;
  const tiles = [
    { label: "Bots", value: stats?.bots, href: "/bots", icon: BotIcon },
    { label: "Monitoring", value: stats?.monitoredBots, href: "/bots?filter=monitoring", icon: Radio },
    { label: "Channels", value: stats?.channels, href: "/chats?filter=channel", icon: Megaphone },
    { label: "Groups", value: stats?.groups, href: "/chats?filter=group", icon: Users },
    {
      label: "Bot users",
      value: stats?.botUsers,
      href: "/bots?filter=monitoring",
      icon: Activity,
      sparkline: trend?.map((p) => p.botUsersNew),
      delta: trend ? sumLast(trend, 7, (p) => p.botUsersNew) : undefined,
    },
    {
      label: "Messages today",
      value: stats?.messagesToday,
      href: "/bots?filter=monitoring",
      icon: MessageSquare,
      sparkline: trend?.map((p) => p.botMessagesIn),
      delta: trend ? sumLast(trend, 7, (p) => p.botMessagesIn) : undefined,
    },
  ];

  return (
    <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map(({ label, value, href, icon: Icon, sparkline, delta }) => (
        <StaggerItem key={label}>
          <Link href={href}>
            <InteractiveCard className="h-full p-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs text-[var(--muted)]">
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </div>
              {value === undefined ? (
                <Skeleton className="h-7 w-10" />
              ) : (
                <>
                  <div className="text-2xl font-semibold">{compact.format(value)}</div>
                  {delta !== undefined && (
                    <div className="mt-1 text-xs text-[var(--muted)]">+{compact.format(delta)} this week</div>
                  )}
                  {sparkline && sparkline.some((v) => v > 0) && (
                    <Sparkline values={sparkline} className="mt-2" />
                  )}
                </>
              )}
            </InteractiveCard>
          </Link>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

function RecentMessages({ stats, className }: { stats: OverviewStats | null; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Recent bot messages</CardTitle>
        {stats && stats.recentMessages.length > 0 && (
          <span className="text-xs text-[var(--muted)]">From bots with monitoring on</span>
        )}
      </CardHeader>
      {stats === null ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : stats.recentMessages.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-[var(--muted)]">
          <MessageSquare className="h-7 w-7" />
          <p>No messages yet. Turn on monitoring for a bot to see what people send it here.</p>
          <Button variant="outline" size="sm" asChild>
            <Link href="/bots">Go to bots</Link>
          </Button>
        </div>
      ) : (
        <ul className="-mx-2 divide-y divide-[var(--card-border)]">
          {stats.recentMessages.map((m) => (
            <li key={m.id}>
              <Link
                href={`/bots/${m.botId}?tab=messages`}
                className="flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10 text-xs font-semibold text-[var(--primary)]">
                  {m.fromName.replace(/^@/, "").charAt(0).toUpperCase() || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium">
                      {m.fromName} <span className="font-normal text-[var(--muted)]">→ @{m.botUsername}</span>
                    </span>
                    <span className="shrink-0 text-xs text-[var(--muted)]">{timeAgo(m.createdAt)}</span>
                  </div>
                  <p className="truncate text-sm text-[var(--muted)]">{m.text || "(non-text message)"}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function QuickActions() {
  const actions = [
    { href: "/bots/new", label: "Create a bot", hint: "Through BotFather, in one step", icon: BotIcon },
    { href: "/chats/new", label: "Create a channel or group", hint: "With a random name if you like", icon: Megaphone },
    { href: "/telegram-accounts/new", label: "Link another account", hint: "Scan a QR code", icon: QrCode },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick actions</CardTitle>
      </CardHeader>
      <ul className="-mx-2 space-y-1">
        {actions.map(({ href, label, hint, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{label}</span>
                <span className="block truncate text-xs text-[var(--muted)]">{hint}</span>
              </span>
              <Plus className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--muted)]" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
