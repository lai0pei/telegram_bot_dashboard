"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { FadeIn } from "@/components/motion";
import { setupFlags, setupProgress } from "@/lib/setup-progress";
import type { AutoReplyRule, BotDetail } from "./types";
import { BotShell } from "./bot-shell";
import { OverviewSection } from "./overview-section";
import { resolveSection, type SectionId } from "./sections";
import { HealthCard, BusinessCard, CapabilitiesCard, TokenCard } from "./info-tab";
import { ProfileSection } from "./profile-section";
import { CommandsTab } from "./commands-tab";
import { WebhookTab } from "./webhook-tab";
import { MessagesTab } from "./messages-tab";
import { ChatsTab } from "./chats-tab";
import { AutomationTab } from "./automation-tab";
import { DeepLinksCard } from "./deep-links-card";
import { InlineResultsCard } from "./inline-results-card";
import { BuilderSection } from "./builder-section";
import { TemplatesSection } from "./templates-section";
import { OutboxTab } from "./outbox-tab";
import { StatsTab } from "./stats-tab";
import { RevenueTab } from "./revenue-tab";
import { AppsTab } from "./apps-tab";
import { MenuButtonCard } from "./menu-button-card";
import { AdminRightsCard } from "./admin-rights-card";
import { CloneCard } from "./clone-card";
import { DangerTab } from "./danger-tab";
import BotDetailLoading from "./loading";

export default function BotDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  // `?s=messages` picks a section; the old `?tab=` values still resolve (the overview's links used them).
  const [section, setSection] = useState<SectionId>(() => resolveSection(search.get("s"), search.get("tab")));
  const [bot, setBot] = useState<BotDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [fetchingToken, setFetchingToken] = useState(false);
  // Bumped after a photo upload/removal so every avatar of this bot refetches.
  const [photoVersion, setPhotoVersion] = useState(0);
  // The setup checklist and the sidebar badge count the same facts, so the page loads them once. null = not known yet.
  const [rules, setRules] = useState<AutoReplyRule[] | null>(null);
  const [rulesVersion, setRulesVersion] = useState(0);
  const [rulesFailed, setRulesFailed] = useState(false);
  const [hasPhoto, setHasPhoto] = useState<boolean | null>(null);
  // A template picked elsewhere (the empty "All rules" list, `?template=`) arrives preselected in the Templates section.
  const [templateId, setTemplateId] = useState<string | null>(() => search.get("template"));

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<BotDetail>(`/api/bots/${params.id}`);
      setBot(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load bot.");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    // Intentional: fetch-on-mount into local state, not state synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    let live = true;
    apiFetch<{ rules: AutoReplyRule[] }>(`/api/bots/${params.id}/auto-replies`)
      .then((r) => {
        if (!live) return;
        setRules(r.rules);
        setRulesFailed(false);
      })
      .catch(() => live && setRulesFailed(true));
    return () => {
      live = false;
    };
  }, [params.id, rulesVersion]);

  useEffect(() => {
    let live = true;
    // 404 = the bot has no photo; any other failure (rate limit, network) is "unknown", not "missing". The route is cached.
    fetch(`/api/bots/${params.id}/photo?v=${photoVersion}`)
      .then((r) => live && setHasPhoto(r.ok ? true : r.status === 404 ? false : null))
      .catch(() => live && setHasPhoto(null));
    return () => {
      live = false;
    };
  }, [params.id, photoVersion]);

  /** Switches section without a navigation: the URL is rewritten in place (`?chat=` is only meaningful for Messages). */
  const openSection = useCallback((id: SectionId, chat?: string) => {
    setSection(id);
    // The sections edit rules (and templates add them) without telling this page, so refresh what the badge counts.
    setRulesVersion((v) => v + 1);
    const url = new URL(window.location.href);
    url.searchParams.set("s", id);
    url.searchParams.delete("tab");
    if (chat) url.searchParams.set("chat", chat);
    else url.searchParams.delete("chat");
    window.history.replaceState(null, "", url);
  }, []);

  const pickTemplate = useCallback(
    (id: string | null) => {
      setTemplateId(id);
      openSection("templates");
    },
    [openSection]
  );

  async function reload() {
    setReloading(true);
    try {
      await load();
    } finally {
      setReloading(false);
    }
  }

  async function fetchToken() {
    if (fetchingToken) return;
    setFetchingToken(true);
    try {
      await apiFetch(`/api/bots/${params.id}/token`);
      toast.success("Token fetched.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch token.");
    } finally {
      setFetchingToken(false);
    }
  }

  const badges: Partial<Record<SectionId, string>> = {};
  if (bot?.health?.status === "error") badges.overview = "!";
  if (bot?.commands?.length) badges.commands = String(bot.commands.length);
  if (bot && bot.hasToken && rules && hasPhoto !== null && !badges.overview) {
    const { done, total } = setupProgress(
      setupFlags({
        hasPhoto,
        shortDescription: bot.shortDescription,
        description: bot.description,
        startRuleEnabled: rules.some((r) => r.enabled && r.matchType === "command" && r.pattern === "start"),
        commandsCount: bot.commands?.length ?? 0,
        monitorEnabled: bot.monitorEnabled,
        webhookUrl: bot.webhook?.url,
      })
    );
    if (done < total) badges.overview = `${done}/${total}`;
  }

  if (loading && !bot) return <BotDetailLoading />;
  if (!bot) return <p className="text-sm text-[var(--danger)]">Bot not found.</p>;

  const photoSrc = `/api/bots/${bot.id}/photo?v=${photoVersion}`;

  return (
    <FadeIn>
      <BotShell
        bot={bot}
        section={section}
        onSection={openSection}
        photoSrc={photoSrc}
        onReload={reload}
        reloading={reloading}
        onFetchToken={fetchToken}
        fetchingToken={fetchingToken}
        badges={badges}
      >
        {section === "overview" && (
          <OverviewSection
            bot={bot}
            photoSrc={photoSrc}
            rules={rules}
            rulesFailed={rulesFailed}
            hasPhoto={hasPhoto}
            onRulesChanged={() => setRulesVersion((v) => v + 1)}
            onChange={load}
            onOpen={openSection}
          />
        )}
        {section === "builder" && <BuilderSection bot={bot} photoSrc={photoSrc} onOpen={openSection} />}
        {section === "templates" && <TemplatesSection bot={bot} photoSrc={photoSrc} initialTemplateId={templateId} onChange={load} onOpen={openSection} />}
        {section === "messages" && <MessagesTab bot={bot} onChange={load} />}
        {section === "chats" && <ChatsTab bot={bot} />}
        {section === "automation" && <AutomationTab bot={bot} onPickTemplate={pickTemplate} />}
        {section === "links" && (
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <DeepLinksCard bot={bot} />
            <InlineResultsCard bot={bot} />
          </div>
        )}
        {section === "outbox" && <OutboxTab bot={bot} />}
        {section === "profile" && (
          <ProfileSection bot={bot} photoSrc={photoSrc} onPhotoChanged={() => setPhotoVersion((v) => v + 1)} onSaved={load} />
        )}
        {section === "commands" && <CommandsTab bot={bot} onSaved={load} />}
        {section === "menu" && <div className="mx-auto max-w-3xl">{bot.hasToken && <MenuButtonCard bot={bot} />}</div>}
        {section === "delivery" && (
          <div className="mx-auto max-w-3xl">
            <WebhookTab bot={bot} onChange={load} />
          </div>
        )}
        {section === "permissions" && (
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <div className="space-y-4">
              {bot.info && <CapabilitiesCard bot={bot} info={bot.info} onChange={load} />}
              {bot.hasToken && <BusinessCard bot={bot} />}
            </div>
            <div className="space-y-4">{bot.hasToken && <AdminRightsCard bot={bot} />}</div>
          </div>
        )}
        {section === "stats" && <StatsTab bot={bot} />}
        {/* An old ?s=apps link on a bot added by token: the section isn't offered for it, so don't render it either. */}
        {section === "apps" && bot.source !== "token" && <AppsTab bot={bot} />}
        {section === "revenue" && <RevenueTab bot={bot} />}
        {section === "advanced" && (
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <div className="space-y-4">
              <TokenCard bot={bot} onFetchToken={fetchToken} fetchingToken={fetchingToken} onChange={load} />
              <HealthCard bot={bot} onChange={load} />
              {bot.hasToken && <CloneCard bot={bot} />}
            </div>
            <DangerTab bot={bot} onDeleted={() => router.push("/bots")} onTokenChanged={load} />
          </div>
        )}
        {!bot.hasToken && section !== "advanced" && section !== "overview" && (
          <Card className="mt-4 text-sm">
            {bot.source === "token"
              ? "Some actions need the bot's token. Paste its current token under Token & danger."
              : "Some actions need the bot's token. Use “No token — fetch it” in the header."}
          </Card>
        )}
      </BotShell>
    </FadeIn>
  );
}
