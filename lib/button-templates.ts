import { and, desc, eq } from "drizzle-orm";
import type { InlineButton } from "./botapi";
import { db } from "./db";
import { botButtonTemplates } from "./db/schema";

export type ButtonTemplateRow = typeof botButtonTemplates.$inferSelect;

export function toButtonTemplateDto(row: ButtonTemplateRow) {
  let buttons: InlineButton[][] = [];
  try {
    buttons = JSON.parse(row.buttons) as InlineButton[][];
  } catch {
    // Unreadable JSON: show an empty template rather than failing the whole list.
  }
  return { id: row.id, name: row.name, buttons };
}

export function listButtonTemplates(botId: number): ButtonTemplateRow[] {
  return db.select().from(botButtonTemplates).where(eq(botButtonTemplates.botId, botId)).orderBy(desc(botButtonTemplates.id)).all();
}

export function createButtonTemplate(botId: number, name: string, buttons: InlineButton[][]): ButtonTemplateRow {
  return db
    .insert(botButtonTemplates)
    .values({ botId, name: name.trim(), buttons: JSON.stringify(buttons), createdAt: new Date() })
    .returning()
    .get();
}

export function deleteButtonTemplate(botId: number, id: number): boolean {
  return db.delete(botButtonTemplates).where(and(eq(botButtonTemplates.botId, botId), eq(botButtonTemplates.id, id))).run().changes > 0;
}
