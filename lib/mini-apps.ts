import { and, desc, eq } from "drizzle-orm";
import { db } from "./db";
import { botMiniApps } from "./db/schema";

export type MiniAppRow = typeof botMiniApps.$inferSelect;

export function listMiniApps(botId: number): MiniAppRow[] {
  return db.select().from(botMiniApps).where(eq(botMiniApps.botId, botId)).orderBy(desc(botMiniApps.id)).all();
}

export function getMiniApp(botId: number, id: number): MiniAppRow | undefined {
  return db
    .select()
    .from(botMiniApps)
    .where(and(eq(botMiniApps.botId, botId), eq(botMiniApps.id, id)))
    .all()[0];
}

export function saveMiniApp(botId: number, app: { shortName: string; title: string; description: string; url: string }): MiniAppRow {
  return db
    .insert(botMiniApps)
    .values({ botId, ...app, createdAt: new Date() })
    .onConflictDoUpdate({ target: [botMiniApps.botId, botMiniApps.shortName], set: { title: app.title, description: app.description, url: app.url } })
    .returning()
    .get();
}

export function removeMiniApp(botId: number, id: number): void {
  db.delete(botMiniApps).where(and(eq(botMiniApps.botId, botId), eq(botMiniApps.id, id))).run();
}
