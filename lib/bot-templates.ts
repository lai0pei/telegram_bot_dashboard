import type { InlineButton } from "./botapi";

/**
 * Starter recipes for a bot. Plain data with no server imports, so the dashboard can preview a template and the API
 * route can apply the very same definition: the client only ever sends a template ID, never rule content.
 *
 * Button IDs are namespaced (`tpl_<template>_<name>`): rules are matched first-come in list order and a template's
 * rules are appended last, so a bare "back" would collide with a rule the owner already has and silently lose.
 */
export interface TemplateRule {
  matchType: "command" | "exact" | "contains" | "callback" | "media";
  pattern: string;
  replyText: string;
  parseMode?: "HTML" | "MarkdownV2" | null;
  buttons?: InlineButton[][];
  /** Callback rules only; defaults to "toast". */
  callbackAction?: "toast" | "edit" | "reply";
}

export interface BotTemplate {
  id: string;
  title: string;
  blurb: string;
  emoji: string;
  profile?: { shortDescription?: string; description?: string };
  commands: { command: string; description: string }[];
  rules: TemplateRule[];
}

const cb = (text: string, id: string): InlineButton => ({ text, callback_data: id });
const link = (text: string, url: string): InlineButton => ({ text, url });

const WELCOME_MENU: BotTemplate = (() => {
  const home = "Welcome, {first_name}! 👋\nWhat would you like to do?";
  const menu = [[cb("ℹ️ About us", "tpl_menu_about")], [cb("📬 Contact", "tpl_menu_contact")]];
  const back = [[cb("⬅️ Back", "tpl_menu_home")]];
  return {
    id: "welcome-menu",
    title: "Welcome + menu",
    blurb: "A friendly greeting with a small button menu (About, Contact) that people can move through.",
    emoji: "👋",
    profile: {
      shortDescription: "Hello! Press Start to open the menu.",
      description: "I'm a friendly bot. Press Start to open the menu and find out more about us or get in touch.",
    },
    commands: [
      { command: "start", description: "Open the main menu" },
      { command: "help", description: "See what I can do" },
    ],
    rules: [
      { matchType: "command", pattern: "start", replyText: home, buttons: menu },
      { matchType: "command", pattern: "help", replyText: "Hi {first_name}! Here is what I can do:\n{commands}" },
      { matchType: "callback", pattern: "tpl_menu_about", callbackAction: "edit", replyText: "ℹ️ About us\n\nWrite a few lines here about who you are and what you do.", buttons: back },
      { matchType: "callback", pattern: "tpl_menu_contact", callbackAction: "edit", replyText: "📬 Contact\n\nReach us at hello@example.com — or just write a message here.", buttons: back },
      { matchType: "callback", pattern: "tpl_menu_home", callbackAction: "edit", replyText: home, buttons: menu },
    ],
  };
})();

const FAQ: BotTemplate = (() => {
  const home = "Hi {first_name}! What would you like to know?";
  const menu = [[cb("🕒 Opening hours", "tpl_faq_hours")], [cb("💶 Prices", "tpl_faq_prices")], [cb("🚚 Shipping", "tpl_faq_shipping")]];
  const back = [[cb("⬅️ Back to questions", "tpl_faq_home")]];
  return {
    id: "faq",
    title: "FAQ bot",
    blurb: "Answers common questions instantly. People pick a question and the answer replaces the menu.",
    emoji: "❓",
    profile: {
      shortDescription: "Quick answers to common questions.",
      description: "Press Start and pick a question. Can't find your answer? Just write to us here.",
    },
    commands: [
      { command: "start", description: "Show the questions" },
      { command: "faq", description: "Frequently asked questions" },
    ],
    rules: [
      { matchType: "command", pattern: "start", replyText: home, buttons: menu },
      { matchType: "command", pattern: "faq", replyText: home, buttons: menu },
      { matchType: "callback", pattern: "tpl_faq_hours", callbackAction: "edit", replyText: "🕒 Opening hours\n\nMonday–Friday, 9:00–17:00. Replace this with your own hours.", buttons: back },
      { matchType: "callback", pattern: "tpl_faq_prices", callbackAction: "edit", replyText: "💶 Prices\n\nTell people what things cost, or where to find the price list.", buttons: back },
      { matchType: "callback", pattern: "tpl_faq_shipping", callbackAction: "edit", replyText: "🚚 Shipping\n\nExplain how long delivery takes and what it costs.", buttons: back },
      { matchType: "callback", pattern: "tpl_faq_home", callbackAction: "edit", replyText: home, buttons: menu },
    ],
  };
})();

const SUPPORT: BotTemplate = {
  id: "support",
  title: "Support inbox",
  blurb: "People write to the bot and you answer from the Messages section. It acknowledges photos and files for you.",
  emoji: "💬",
  profile: {
    shortDescription: "Write to us — we reply as soon as we can.",
    description: "Send your question here and our team will answer you personally.",
  },
  commands: [{ command: "start", description: "Start a conversation" }],
  rules: [
    { matchType: "command", pattern: "start", replyText: "Hi {first_name}! 👋 Tell us what you need help with and we'll reply here as soon as we can." },
    { matchType: "media", pattern: "photo", replyText: "Thanks, we got your photo! We'll take a look and get back to you." },
    { matchType: "media", pattern: "document", replyText: "Thanks, we got your file! We'll take a look and get back to you." },
    { matchType: "exact", pattern: "thanks", replyText: "You're welcome! 😊" },
  ],
};

const LINK_HUB: BotTemplate = {
  id: "links",
  title: "Link hub",
  blurb: "One message with buttons that open your website, shop and channel. Edit the web addresses afterwards.",
  emoji: "🔗",
  profile: {
    shortDescription: "All our links in one place.",
    description: "Press Start to open our website, shop and social pages.",
  },
  commands: [{ command: "start", description: "Show our links" }],
  rules: [
    {
      matchType: "command",
      pattern: "start",
      replyText: "Hi {first_name}! Here is where to find us:",
      buttons: [[link("🌐 Website", "https://example.com")], [link("🛍 Shop", "https://example.com/shop")], [link("📣 Channel", "https://t.me/telegram")]],
    },
  ],
};

export const BOT_TEMPLATES: BotTemplate[] = [WELCOME_MENU, FAQ, SUPPORT, LINK_HUB];

export const getBotTemplate = (id: string): BotTemplate | undefined => BOT_TEMPLATES.find((t) => t.id === id);

/** What identifies a rule for "already there" checks (commands are stored lowercase without the slash). */
export const templateRuleKey = (r: { matchType: string; pattern: string }) => `${r.matchType}:${r.pattern.trim().toLowerCase()}`;

export const TEMPLATE_PARTS = ["profile", "commands", "rules", "monitoring"] as const;
export type TemplatePart = (typeof TEMPLATE_PARTS)[number];
