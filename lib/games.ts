import { and, desc, eq } from "drizzle-orm";
import { db } from "./db";
import { botGames } from "./db/schema";

/** The URL a pressed Play button of this game should open (the game's own HTML5 page), if the dashboard knows it. */
export function gameUrlFor(botId: number, shortName: string): string | null {
  const row = db
    .select({ url: botGames.url })
    .from(botGames)
    .where(and(eq(botGames.botId, botId), eq(botGames.shortName, shortName)))
    .all()[0];
  return row?.url ?? null;
}

export type GameRow = typeof botGames.$inferSelect;

export function listGames(botId: number): GameRow[] {
  return db.select().from(botGames).where(eq(botGames.botId, botId)).orderBy(desc(botGames.id)).all();
}

export function getGame(botId: number, id: number): GameRow | undefined {
  return db
    .select()
    .from(botGames)
    .where(and(eq(botGames.botId, botId), eq(botGames.id, id)))
    .all()[0];
}

export function saveGame(botId: number, game: { shortName: string; title: string; description: string; url: string | null }): GameRow {
  return db
    .insert(botGames)
    .values({ botId, ...game, createdAt: new Date() })
    .onConflictDoUpdate({ target: [botGames.botId, botGames.shortName], set: { title: game.title, description: game.description, url: game.url } })
    .returning()
    .get();
}

/** Sets (or clears) the page a pressed Play button opens. */
export function setGameUrl(botId: number, id: number, url: string | null): GameRow | undefined {
  return db
    .update(botGames)
    .set({ url })
    .where(and(eq(botGames.botId, botId), eq(botGames.id, id)))
    .returning()
    .get();
}

export function removeGame(botId: number, id: number): void {
  db.delete(botGames).where(and(eq(botGames.botId, botId), eq(botGames.id, id))).run();
}
