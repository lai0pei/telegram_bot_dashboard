import type { BotCommand } from "./types";

/** Telegram's three conventional commands; the Commands tab and the setup checklist both offer them. */
export const ESSENTIAL_COMMANDS: BotCommand[] = [
  { command: "start", description: "Start the bot" },
  { command: "help", description: "Show help and the available commands" },
  { command: "settings", description: "View or change your settings" },
];
