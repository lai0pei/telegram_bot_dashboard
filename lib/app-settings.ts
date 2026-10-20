import { eq } from "drizzle-orm";
import { isMasterAdminTelegramId } from "./admin";
import { db } from "./db";
import { appSettings } from "./db/schema";

/**
 * Who may sign up and which Telegram accounts may be linked. Both can be set
 * from the Admin → Access tab; a stored value overrides the environment
 * variable (REGISTRATION_ENABLED, ALLOWED_TELEGRAM_USER_IDS) and removing it
 * ("Reset to .env") falls back to it, so a deployment that never touches the
 * tab behaves exactly as before.
 */

const REGISTRATION_KEY = "registration"; // "open" | "closed"
const ALLOWLIST_KEY = "allowlist"; // JSON: { restrict: boolean, ids: string[] }

export interface Allowlist {
  /** When false anyone may link, whatever `ids` holds (kept so the list survives switching restriction off and on). */
  restrict: boolean;
  ids: string[];
}

export type SettingSource = "env" | "set";

export interface AccessSettings {
  registrationOpen: boolean;
  registrationSource: SettingSource;
  allowlist: Allowlist;
  allowlistSource: SettingSource;
  /** What the environment alone would give, shown next to "Reset to .env". */
  env: { registrationOpen: boolean; allowlist: Allowlist };
}

/** Rows are read at most this often, and the cache is dropped on every write, so edits apply at once within this process. */
const CACHE_MS = 10_000;

declare global {
  var __tgDashSettings: { at: number; rows: Map<string, string> } | undefined;
}

async function loadRows(): Promise<Map<string, string>> {
  const cached = globalThis.__tgDashSettings;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.rows;
  const rows = new Map((await db.select().from(appSettings)).map((r) => [r.key, r.value]));
  globalThis.__tgDashSettings = { at: Date.now(), rows };
  return rows;
}

export function invalidateSettingsCache(): void {
  globalThis.__tgDashSettings = undefined;
}

function envAllowlist(): Allowlist {
  const ids = (process.env.ALLOWED_TELEGRAM_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  // The env var's own rule: an empty list means "anyone may link".
  return { restrict: ids.length > 0, ids };
}

function envRegistrationOpen(): boolean {
  return process.env.REGISTRATION_ENABLED !== "false";
}

/**
 * A stored allowlist that can't be read must not silently open linking to
 * everyone, so it fails closed: restricted, no IDs (the master admin always
 * passes and can fix it).
 */
function parseAllowlist(raw: string): Allowlist {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as Allowlist).restrict === "boolean" &&
      Array.isArray((parsed as Allowlist).ids) &&
      (parsed as Allowlist).ids.every((id) => typeof id === "string")
    ) {
      return { restrict: (parsed as Allowlist).restrict, ids: (parsed as Allowlist).ids };
    }
  } catch {
    // falls through to the closed default
  }
  console.error("[app-settings] stored allowlist is unreadable; treating linking as restricted to nobody.");
  return { restrict: true, ids: [] };
}

export async function getAccessSettings(): Promise<AccessSettings> {
  const rows = await loadRows();
  const registration = rows.get(REGISTRATION_KEY);
  const allowlist = rows.get(ALLOWLIST_KEY);
  return {
    registrationOpen: registration === undefined ? envRegistrationOpen() : registration === "open",
    registrationSource: registration === undefined ? "env" : "set",
    allowlist: allowlist === undefined ? envAllowlist() : parseAllowlist(allowlist),
    allowlistSource: allowlist === undefined ? "env" : "set",
    env: { registrationOpen: envRegistrationOpen(), allowlist: envAllowlist() },
  };
}

/** Whether an unrecognised Telegram account signing in may create a new dashboard account. The master admin always may. */
export async function isRegistrationOpenFor(telegramUserId: string): Promise<boolean> {
  if (isMasterAdminTelegramId(telegramUserId)) return true;
  return (await getAccessSettings()).registrationOpen;
}

/** Whether this Telegram account may sign in or be linked at all. The master admin always may. */
export async function isTelegramUserAllowed(telegramUserId: string): Promise<boolean> {
  if (isMasterAdminTelegramId(telegramUserId)) return true;
  const { allowlist } = await getAccessSettings();
  return !allowlist.restrict || allowlist.ids.includes(telegramUserId);
}

/** What to store for one setting: a value, or `null` to remove the row and fall back to the environment. */
export type SettingChange = { key: typeof REGISTRATION_KEY; value: boolean | null } | { key: typeof ALLOWLIST_KEY; value: Allowlist | null };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Applies one change inside the caller's transaction (so it commits together with its audit row). Call invalidateSettingsCache() after commit. */
export async function writeSetting(tx: Tx, change: SettingChange): Promise<void> {
  if (change.value === null) {
    await tx.delete(appSettings).where(eq(appSettings.key, change.key));
    return;
  }
  const value =
    change.key === REGISTRATION_KEY ? (change.value ? "open" : "closed") : JSON.stringify(change.value satisfies Allowlist);
  await tx
    .insert(appSettings)
    .values({ key: change.key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}
