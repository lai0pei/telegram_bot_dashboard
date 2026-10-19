/**
 * Validation rules mirroring Telegram's own constraints for BotFather/Bot API
 * fields. Shared between client forms (immediate feedback) and API routes
 * (the actual gate — never trust the client).
 */

const USERNAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{3,30}[bB][oO][tT]$/;

export function validateBotName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Name is required.";
  if (trimmed.length > 64) return "Name must be at most 64 characters.";
  return null;
}

export function validateBotUsername(username: string): string | null {
  const trimmed = username.trim().replace(/^@/, "");
  if (!trimmed) return "Username is required.";
  if (!USERNAME_PATTERN.test(trimmed)) {
    return 'Username must be 5-32 characters, start with a letter, contain only letters/digits/underscores, and end in "bot".';
  }
  return null;
}

export function validateShortDescription(value: string): string | null {
  if (value.length > 120) return "Short description must be at most 120 characters.";
  return null;
}

export function validateDescription(value: string): string | null {
  if (value.length > 512) return "Description must be at most 512 characters.";
  return null;
}

export function validateCommand(command: string): string | null {
  if (!command) return "Command is required.";
  if (command.length > 32) return "Command must be at most 32 characters.";
  if (!/^[a-z0-9_]+$/.test(command)) return "Command may only contain lowercase letters, digits, and underscores.";
  return null;
}

export function validateCommandDescription(description: string): string | null {
  if (!description) return "Command description is required.";
  if (description.length > 256) return "Command description must be at most 256 characters.";
  return null;
}

export function validateWebhookUrl(url: string): string | null {
  if (!url) return "Webhook URL is required.";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Webhook URL must be a valid URL.";
  }
  if (parsed.protocol !== "https:") return "Webhook URL must use https://.";
  return null;
}

export function validateChatId(chatId: string): string | null {
  const trimmed = chatId.trim();
  if (!trimmed) return "Chat ID is required.";
  if (!/^-?\d+$/.test(trimmed)) return "Chat ID must be numeric.";
  return null;
}

export function validateMessageText(text: string): string | null {
  if (!text.trim()) return "Message text is required.";
  if (text.length > 4096) return "Message must be at most 4096 characters.";
  return null;
}

const CHAT_USERNAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{3,30}[a-zA-Z0-9]$/;

export function validateChatTitle(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return "Title is required.";
  if (trimmed.length > 128) return "Title must be at most 128 characters.";
  return null;
}

export function validateChatAbout(about: string): string | null {
  if (about.length > 255) return "Description must be at most 255 characters.";
  return null;
}

/** Empty is allowed and means "private". */
export function validateChatUsername(username: string): string | null {
  const trimmed = username.trim().replace(/^@/, "");
  if (!trimmed) return null;
  if (!CHAT_USERNAME_PATTERN.test(trimmed)) {
    return "Username must be 5-32 characters, start with a letter, contain only letters/digits/underscores, and not end with an underscore.";
  }
  return null;
}
