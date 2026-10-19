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
}

export interface BotDetail {
  id: number;
  username: string;
  firstName: string;
  hasToken: boolean;
  token?: string;
  monitorEnabled: boolean;
  info?: { id: number; first_name: string; username?: string };
  name?: string;
  description?: string;
  shortDescription?: string;
  commands?: BotCommand[];
  webhook?: WebhookInfo | null;
}

export interface BotMessageRow {
  id: number;
  chatId: string;
  fromUserId: string | null;
  fromUsername: string | null;
  fromFirstName: string | null;
  direction: "in" | "out";
  text: string | null;
  createdAt: string;
}
