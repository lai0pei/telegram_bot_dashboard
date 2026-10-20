import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { botDeepLinks, botUsers } from "./db/schema";
import type { DeepLinkInput } from "./deep-links-shared";

export type DeepLinkRow = typeof botDeepLinks.$inferSelect;

/** The t.me URL for a saved link. */
export function deepLinkUrl(botUsername: string, link: Pick<DeepLinkRow, "kind" | "payload" | "appShortName" | "admin">): string {
  const base = `https://t.me/${botUsername}`;
  const payload = encodeURIComponent(link.payload);
  if (link.kind === "startapp") return `${link.appShortName ? `${base}/${link.appShortName}` : base}?startapp=${payload}`;
  const admin = link.admin ? `&admin=${link.admin.split(",").filter(Boolean).join("+")}` : "";
  return `${base}?${link.kind}=${payload}${link.kind === "start" ? "" : admin}`;
}

/** Saved links with how many contacts first arrived through each `start` payload. */
export async function listDeepLinks(botId: number): Promise<(DeepLinkRow & { arrivals: number | null })[]> {
  const counts = new Map(
    (await db
      .select({ payload: botUsers.startPayload, n: sql<number>`count(*)::int` })
      .from(botUsers)
      .where(and(eq(botUsers.botId, botId), sql`${botUsers.startPayload} is not null`))
      .groupBy(botUsers.startPayload))
      .map((r) => [r.payload, r.n])
  );
  return (await db
    .select()
    .from(botDeepLinks)
    .where(eq(botDeepLinks.botId, botId))
    .orderBy(desc(botDeepLinks.id)))
    // Only /start payloads are recorded on contacts; the other kinds arrive as other updates.
    .map((l) => ({ ...l, arrivals: l.kind === "start" ? counts.get(l.payload) ?? 0 : null }));
}

export async function createDeepLink(botId: number, input: DeepLinkInput): Promise<DeepLinkRow> {
  return (await db
    .insert(botDeepLinks)
    .values({
      botId,
      label: input.label.trim(),
      kind: input.kind,
      payload: input.payload,
      appShortName: input.kind === "startapp" ? input.appShortName || null : null,
      admin: input.admin?.length ? input.admin.join(",") : null,
      createdAt: new Date(),
    })
    .returning())[0];
}

export async function deleteDeepLink(botId: number, id: number): Promise<boolean> {
  return (await db.delete(botDeepLinks).where(and(eq(botDeepLinks.botId, botId), eq(botDeepLinks.id, id)))).count > 0;
}
