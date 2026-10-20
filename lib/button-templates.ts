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

export async function listButtonTemplates(botId: number): Promise<ButtonTemplateRow[]> {
  return await db.select().from(botButtonTemplates).where(eq(botButtonTemplates.botId, botId)).orderBy(desc(botButtonTemplates.id));
}

export async function createButtonTemplate(botId: number, name: string, buttons: InlineButton[][]): Promise<ButtonTemplateRow> {
  return (await db
    .insert(botButtonTemplates)
    .values({ botId, name: name.trim(), buttons: JSON.stringify(buttons), createdAt: new Date() })
    .returning())[0];
}

export async function deleteButtonTemplate(botId: number, id: number): Promise<boolean> {
  return (await db.delete(botButtonTemplates).where(and(eq(botButtonTemplates.botId, botId), eq(botButtonTemplates.id, id)))).count > 0;
}
