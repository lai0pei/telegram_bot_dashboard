import { and, desc, eq } from "drizzle-orm";
import { db } from "./db";
import { botGames } from "./db/schema";

/** The URL a pressed Play button of this game should open (the game's own HTML5 page), if the dashboard knows it. */
export async function gameUrlFor(botId: number, shortName: string): Promise<string | null> {
  const row = (await db
    .select({ url: botGames.url })
    .from(botGames)
    .where(and(eq(botGames.botId, botId), eq(botGames.shortName, shortName))))[0];
  return row?.url ?? null;
}

export type GameRow = typeof botGames.$inferSelect;

export async function listGames(botId: number): Promise<GameRow[]> {
  return await db.select().from(botGames).where(eq(botGames.botId, botId)).orderBy(desc(botGames.id));
}

export async function getGame(botId: number, id: number): Promise<GameRow | undefined> {
  return (await db
    .select()
    .from(botGames)
    .where(and(eq(botGames.botId, botId), eq(botGames.id, id))))[0];
}

export async function saveGame(botId: number, game: { shortName: string; title: string; description: string; url: string | null }): Promise<GameRow> {
  return (await db
    .insert(botGames)
    .values({ botId, ...game, createdAt: new Date() })
    .onConflictDoUpdate({ target: [botGames.botId, botGames.shortName], set: { title: game.title, description: game.description, url: game.url } })
    .returning())[0];
}

/** Sets (or clears) the page a pressed Play button opens. */
export async function setGameUrl(botId: number, id: number, url: string | null): Promise<GameRow | undefined> {
  return (await db
    .update(botGames)
    .set({ url })
    .where(and(eq(botGames.botId, botId), eq(botGames.id, id)))
    .returning())[0];
}

export async function removeGame(botId: number, id: number): Promise<void> {
  await db.delete(botGames).where(and(eq(botGames.botId, botId), eq(botGames.id, id)));
}
