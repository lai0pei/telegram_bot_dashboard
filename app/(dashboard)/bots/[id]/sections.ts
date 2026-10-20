import {
  BarChart3,
  Boxes,
  Coins,
  GitBranch,
  LayoutDashboard,
  LayoutTemplate,
  MessageSquare,
  MessagesSquare,
  Radio,
  Send,
  ShieldAlert,
  ShieldCheck,
  Slash,
  Sticker,
  UserCog,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type SectionId =
  | "overview"
  | "builder"
  | "templates"
  | "messages"
  | "chats"
  | "automation"
  | "outbox"
  | "profile"
  | "commands"
  | "delivery"
  | "permissions"
  | "stats"
  | "stickers"
  | "apps"
  | "revenue"
  | "advanced";

export interface Section {
  id: SectionId;
  label: string;
  icon: LucideIcon;
}

export interface SectionGroup {
  label: string | null;
  sections: Section[];
}

export const SECTION_GROUPS: SectionGroup[] = [
  { label: null, sections: [{ id: "overview", label: "Overview", icon: LayoutDashboard }] },
  {
    label: "Build",
    sections: [
      { id: "builder", label: "Conversation builder", icon: GitBranch },
      { id: "templates", label: "Templates", icon: LayoutTemplate },
    ],
  },
  {
    label: "Conversations",
    sections: [
      { id: "messages", label: "Messages", icon: MessageSquare },
      { id: "chats", label: "Chats", icon: MessagesSquare },
    ],
  },
  {
    label: "Engage",
    sections: [
      { id: "automation", label: "All rules", icon: Zap },
      { id: "outbox", label: "Outbox", icon: Send },
    ],
  },
  {
    label: "Configure",
    sections: [
      { id: "profile", label: "Profile", icon: UserCog },
      { id: "commands", label: "Commands & menu", icon: Slash },
      { id: "delivery", label: "Delivery", icon: Radio },
      { id: "permissions", label: "Permissions", icon: ShieldCheck },
    ],
  },
  {
    label: "Extras",
    sections: [
      { id: "stats", label: "Stats", icon: BarChart3 },
      { id: "stickers", label: "Stickers", icon: Sticker },
      { id: "apps", label: "Apps & games", icon: Boxes },
      { id: "revenue", label: "Revenue", icon: Coins },
    ],
  },
  { label: "Advanced", sections: [{ id: "advanced", label: "Token & danger", icon: ShieldAlert }] },
];

export const SECTIONS: Section[] = SECTION_GROUPS.flatMap((g) => g.sections);

/** The old `?tab=` values, so existing links keep opening the right place. */
const TAB_ALIASES: Record<string, SectionId> = {
  info: "overview",
  settings: "profile",
  commands: "commands",
  webhook: "delivery",
  danger: "advanced",
};

export function isSectionId(value: string | null | undefined): value is SectionId {
  return SECTIONS.some((s) => s.id === value);
}

/** Resolves `?s=` (or a legacy `?tab=`) to a section, defaulting to the overview. */
export function resolveSection(s: string | null, tab: string | null): SectionId {
  if (isSectionId(s)) return s;
  if (isSectionId(tab)) return tab;
  if (tab && tab in TAB_ALIASES) return TAB_ALIASES[tab];
  return "overview";
}
