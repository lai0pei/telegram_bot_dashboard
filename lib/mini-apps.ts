import { and, desc, eq } from "drizzle-orm";
import { db } from "./db";
import { botMiniApps } from "./db/schema";

export type MiniAppRow = typeof botMiniApps.$inferSelect;

export async function listMiniApps(botId: number): Promise<MiniAppRow[]> {
  return await db.select().from(botMiniApps).where(eq(botMiniApps.botId, botId)).orderBy(desc(botMiniApps.id));
}

export async function getMiniApp(botId: number, id: number): Promise<MiniAppRow | undefined> {
  return (await db
    .select()
    .from(botMiniApps)
    .where(and(eq(botMiniApps.botId, botId), eq(botMiniApps.id, id))))[0];
}

export async function saveMiniApp(botId: number, app: { shortName: string; title: string; description: string; url: string }): Promise<MiniAppRow> {
  return (await db
    .insert(botMiniApps)
    .values({ botId, ...app, createdAt: new Date() })
    .onConflictDoUpdate({ target: [botMiniApps.botId, botMiniApps.shortName], set: { title: app.title, description: app.description, url: app.url } })
    .returning())[0];
}

export async function removeMiniApp(botId: number, id: number): Promise<void> {
  await db.delete(botMiniApps).where(and(eq(botMiniApps.botId, botId), eq(botMiniApps.id, id)));
}
