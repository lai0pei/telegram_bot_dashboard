"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfilePhotoCard } from "../../profile-photo-card";
import { SettingsTab, type ProfileDraft } from "./settings-tab";
import { TelegramPreview } from "./telegram-preview";
import type { BotDetail } from "./types";
import { UsernamesCard } from "./usernames-card";

/** Profile: the editor on one side, a live preview of the bot's start screen (and the photo and usernames) on the other. */
export function ProfileSection({ bot, photoSrc, onPhotoChanged, onSaved }: { bot: BotDetail; photoSrc: string; onPhotoChanged: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<ProfileDraft>({
    name: bot.name ?? bot.firstName,
    shortDescription: bot.shortDescription ?? "",
    description: bot.description ?? "",
  });

  return (
    <div className="grid items-start gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <Card className="xl:sticky xl:top-6">
          <CardHeader>
            <CardTitle>How people first see your bot</CardTitle>
          </CardHeader>
          <TelegramPreview
            mode="profile"
            botName={draft.name}
            username={bot.username}
            photoSrc={photoSrc}
            shortDescription={draft.shortDescription}
            description={draft.description}
          />
        </Card>
      </div>
      <div className="space-y-4">
        <SettingsTab bot={bot} onSaved={onSaved} onDraftChange={setDraft} />
        {bot.source === "token" ? (
          <Card className="text-sm">
            <h3 className="mb-1 font-semibold">Photo and usernames</h3>
            <p className="text-[var(--muted)]">
              The profile photo, video and collectible usernames can only be changed by the bot&apos;s owner (in @BotFather). Everything else on this page works.
            </p>
          </Card>
        ) : (
          <>
            <ProfilePhotoCard endpoint={`/api/bots/${bot.id}/photo`} name={bot.username} photoSrc={photoSrc} onChanged={onPhotoChanged} allowVideo />
            <UsernamesCard bot={bot} />
          </>
        )}
      </div>
    </div>
  );
}
