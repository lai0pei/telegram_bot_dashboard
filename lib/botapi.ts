/**
 * Thin typed wrapper around the Telegram Bot API (https://api.telegram.org).
 * One function per method actually used by the dashboard — not a full SDK.
 */

const BASE_URL = "https://api.telegram.org";

export class BotApiError extends Error {
  constructor(public method: string, public description: string, public errorCode?: number) {
    super(`Bot API ${method} failed: ${description}`);
  }
}

async function call<T>(token: string, method: string, params?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE_URL}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: params ? JSON.stringify(params) : undefined,
    cache: "no-store",
  });
  const json = await res.json();
  if (!json.ok) {
    throw new BotApiError(method, json.description ?? "Unknown error", json.error_code);
  }
  return json.result as T;
}

export interface BotApiUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  supports_inline_queries?: boolean;
}

export interface BotCommand {
  command: string;
  description: string;
}

export interface WebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: { id: number; type: string; username?: string; first_name?: string };
  from?: { id: number; is_bot: boolean; first_name: string; username?: string };
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export const botApi = {
  getMe: (token: string) => call<BotApiUser>(token, "getMe"),

  getMyName: (token: string) => call<{ name: string }>(token, "getMyName"),
  setMyName: (token: string, name: string) => call<true>(token, "setMyName", { name }),

  getMyDescription: (token: string) => call<{ description: string }>(token, "getMyDescription"),
  setMyDescription: (token: string, description: string) =>
    call<true>(token, "setMyDescription", { description }),

  getMyShortDescription: (token: string) =>
    call<{ short_description: string }>(token, "getMyShortDescription"),
  setMyShortDescription: (token: string, short_description: string) =>
    call<true>(token, "setMyShortDescription", { short_description }),

  getMyCommands: (token: string) => call<BotCommand[]>(token, "getMyCommands"),
  setMyCommands: (token: string, commands: BotCommand[]) =>
    call<true>(token, "setMyCommands", { commands }),
  deleteMyCommands: (token: string) => call<true>(token, "deleteMyCommands"),

  getWebhookInfo: (token: string) => call<WebhookInfo>(token, "getWebhookInfo"),
  setWebhook: (token: string, url: string, secretToken?: string) =>
    call<true>(token, "setWebhook", { url, secret_token: secretToken }),
  deleteWebhook: (token: string, dropPendingUpdates = false) =>
    call<true>(token, "deleteWebhook", { drop_pending_updates: dropPendingUpdates }),

  getUpdates: (token: string, offset?: number, timeout = 0) =>
    call<TelegramUpdate[]>(token, "getUpdates", { offset, timeout, allowed_updates: ["message"] }),

  sendMessage: (token: string, chatId: number | string, text: string) =>
    call<TelegramMessage>(token, "sendMessage", { chat_id: chatId, text }),
};
