export type ChatKind = "channel" | "supergroup" | "group";

export interface ChatSummary {
  id: number;
  telegramId: string;
  botApiId: string;
  kind: ChatKind;
  title: string;
  username: string | null;
  isCreator: boolean;
}

export interface ChatDetail extends ChatSummary {
  about: string;
  participantsCount: number | null;
  inviteLink: string | null;
  canChangeInfo: boolean;
  canInviteUsers: boolean;
  canAddAdmins: boolean;
}

export const KIND_LABELS: Record<ChatKind, string> = {
  channel: "Channel",
  supergroup: "Group",
  group: "Basic group",
};
