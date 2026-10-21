import type { InlineButton, KeyboardButton, ReplyKeyboard } from "./botapi";
import type { FollowUp, RuleMediaRef } from "./rule-content";
import { normalizeFollowUps, normalizeInlineButtons, normalizeReplyKeyboard, type AUTO_REPLY_MATCH_TYPES } from "./validation";

/**
 * Starter recipes for a bot. Plain data with no server imports, so the dashboard can preview a template and the API
 * route can apply the very same definition: the client only ever sends a template ID, never rule content.
 *
 * Button IDs are namespaced (`tpl_<template>_<name>`): rules are matched first-come in list order and a template's
 * rules are appended last, so a bare "back" would collide with a rule the owner already has and silently lose.
 */
export interface TemplateRule {
  matchType: (typeof AUTO_REPLY_MATCH_TYPES)[number];
  pattern: string;
  replyText: string;
  parseMode?: "HTML" | "MarkdownV2" | null;
  buttons?: InlineButton[][];
  /** Callback rules only; defaults to "toast". */
  callbackAction?: "toast" | "edit" | "reply";
  // The rest come from templates people save themselves; only `replyKeyboard` is also used by some built-in ones.
  replyKeyboard?: ReplyKeyboard | null;
  showAlert?: boolean;
  /**
   * An attachment and follow-up messages (lib/rule-content.ts). Built-in and saved templates carry no attachments (a file
   * can't travel with them); a setup export does, and the importer replaces each `mediaId` with the new copy's.
   */
  media?: RuleMediaRef | null;
  followUps?: FollowUp[];
  /** Defaults to true; a saved template keeps a rule that was switched off, so its buttons' targets stay in place. */
  enabled?: boolean;
}

export const TEMPLATE_CATEGORIES = ["Getting started", "Business", "Engagement", "Community"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];
/** Not in TEMPLATE_CATEGORIES: its chip only shows when the person has saved one. */
export const CUSTOM_CATEGORY = "My templates" as const;

export interface BotTemplate {
  id: string;
  title: string;
  blurb: string;
  emoji: string;
  category: TemplateCategory | typeof CUSTOM_CATEGORY;
  /** Short feature tags for the card: what this template demonstrates. */
  shows: string[];
  /** The gallery marks it "Start here". */
  featured?: boolean;
  /** A template someone saved (id `custom-<n>`), as opposed to a built-in one. */
  custom?: boolean;
  profile?: { shortDescription?: string; description?: string };
  commands: { command: string; description: string }[];
  rules: TemplateRule[];
}

const cb = (text: string, id: string): InlineButton => ({ text, callback_data: id });
const link = (text: string, url: string): InlineButton => ({ text, url });
const copy = (text: string, value: string): InlineButton => ({ text, copy_text: { text: value } });

const WELCOME_MENU: BotTemplate = (() => {
  const home = "Welcome, {first_name}! 👋\nWhat would you like to do?";
  const menu = [[cb("ℹ️ About us", "tpl_menu_about")], [cb("📬 Contact", "tpl_menu_contact")]];
  const back = [[cb("⬅️ Back", "tpl_menu_home")]];
  return {
    id: "welcome-menu",
    title: "Welcome + menu",
    blurb: "A friendly greeting with a small button menu (About, Contact) that people can move through.",
    emoji: "👋",
    category: "Getting started",
    featured: true,
    shows: ["Button menu", "Back buttons", "Edits in place"],
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
    category: "Getting started",
    shows: ["Question menu", "Answers replace the menu"],
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
  category: "Getting started",
  shows: ["Reply to photos & files", "Catch-all reply", "Answer from Messages"],
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
    // Last resort for anything no rule above knows (it replies to every such private message).
    { matchType: "fallback", pattern: "*", replyText: "Thanks, we got your message! We'll reply here as soon as we can." },
  ],
};

const LINK_HUB: BotTemplate = {
  id: "links",
  title: "Link hub",
  blurb: "One message with buttons that open your website, shop and channel. Edit the web addresses afterwards.",
  emoji: "🔗",
  category: "Getting started",
  shows: ["Link buttons"],
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

const CAFE: BotTemplate = (() => {
  const home = "Welcome to our café, {first_name}! ☕\nWhat can we do for you?";
  const menu = [[cb("📖 Menu", "tpl_cafe_menu")], [cb("🕒 Hours & location", "tpl_cafe_hours")]];
  const backHome = [cb("⬅️ Back", "tpl_cafe_home")];
  const menuText = "📖 Our menu\n\nPick a section:";
  const menuButtons = [[cb("☕ Drinks", "tpl_cafe_drinks")], [cb("🥐 Food", "tpl_cafe_food")], backHome];
  const backMenu = [[cb("⬅️ Menu", "tpl_cafe_menu")]];
  return {
    id: "cafe",
    title: "Café / restaurant",
    blurb: "A two-level menu: Menu → Drinks or Food, plus opening hours with a map button. Swap in your own dishes and prices.",
    emoji: "☕",
    category: "Business",
    shows: ["Menus inside menus", "Back buttons", "Link button"],
    profile: {
      shortDescription: "Menu, opening hours and how to find us.",
      description: "Press Start to see our menu, opening hours and where to find us.",
    },
    commands: [
      { command: "start", description: "Open the main menu" },
      { command: "menu", description: "See our menu" },
    ],
    rules: [
      { matchType: "command", pattern: "start", replyText: home, buttons: menu },
      { matchType: "command", pattern: "menu", replyText: menuText, buttons: menuButtons },
      { matchType: "callback", pattern: "tpl_cafe_menu", callbackAction: "edit", replyText: menuText, buttons: menuButtons },
      { matchType: "callback", pattern: "tpl_cafe_drinks", callbackAction: "edit", replyText: "☕ Drinks\n\nEspresso — 2.50\nCappuccino — 3.50\nIced tea — 3.00\n\n(Replace these with your own.)", buttons: backMenu },
      { matchType: "callback", pattern: "tpl_cafe_food", callbackAction: "edit", replyText: "🥐 Food\n\nCroissant — 2.50\nAvocado toast — 7.00\nDaily soup — 6.00\n\n(Replace these with your own.)", buttons: backMenu },
      { matchType: "callback", pattern: "tpl_cafe_hours", callbackAction: "edit", replyText: "🕒 Opening hours\n\nMon–Fri 8:00–18:00, Sat–Sun 9:00–16:00.\n📍 Replace with your address.", buttons: [[link("🗺 Open the map", "https://maps.google.com")], backHome] },
      { matchType: "callback", pattern: "tpl_cafe_home", callbackAction: "edit", replyText: home, buttons: menu },
    ],
  };
})();

const SHOP: BotTemplate = (() => {
  const home = "Hi {first_name}! 🛍 What are you looking for?";
  const menu = [[cb("👕 Clothing", "tpl_shop_clothing")], [cb("🎧 Gadgets", "tpl_shop_gadgets")]];
  const back = [cb("⬅️ All categories", "tpl_shop_home")];
  return {
    id: "shop",
    title: "Product catalogue",
    blurb: "Categories with product cards. Each card has a Buy link and a tap-to-copy promo code. Edit the products and addresses afterwards.",
    emoji: "🛍",
    category: "Business",
    shows: ["Link buttons", "Copy-code button", "Categories"],
    profile: {
      shortDescription: "Browse our products right here.",
      description: "Press Start to browse our categories, see products and grab a promo code.",
    },
    commands: [
      { command: "start", description: "Browse the catalogue" },
      { command: "shop", description: "Browse the catalogue" },
    ],
    rules: [
      { matchType: "command", pattern: "start", replyText: home, buttons: menu },
      { matchType: "command", pattern: "shop", replyText: home, buttons: menu },
      { matchType: "callback", pattern: "tpl_shop_clothing", callbackAction: "edit", replyText: "👕 Classic T-shirt\n\nSoft cotton, five colours.\nPrice: 20.00\n\n(Replace with your own product.)", buttons: [[link("🛒 Buy now", "https://example.com/tshirt")], [copy("📋 Copy code SAVE10", "SAVE10")], back] },
      { matchType: "callback", pattern: "tpl_shop_gadgets", callbackAction: "edit", replyText: "🎧 Wireless headphones\n\n30 hours of battery.\nPrice: 59.00\n\n(Replace with your own product.)", buttons: [[link("🛒 Buy now", "https://example.com/headphones")], [copy("📋 Copy code SAVE10", "SAVE10")], back] },
      { matchType: "callback", pattern: "tpl_shop_home", callbackAction: "edit", replyText: home, buttons: menu },
    ],
  };
})();

const BOOKING: BotTemplate = (() => {
  const home = "Hi {first_name}! 📅 What would you like to book?";
  const services = [[cb("💇 Haircut", "tpl_book_service")], [cb("💆 Massage", "tpl_book_service")]];
  const days = [[cb("Mon", "tpl_book_day_mon"), cb("Tue", "tpl_book_day_tue"), cb("Wed", "tpl_book_day_wed")], [cb("⬅️ Back", "tpl_book_home")]];
  return {
    id: "booking",
    title: "Appointment booking",
    blurb: "People pick a service and a day; you confirm from the Messages section. Anything else they write goes to you.",
    emoji: "📅",
    category: "Business",
    shows: ["Step-by-step flow", "Reply as a new message", "Hand-off to you"],
    profile: {
      shortDescription: "Book an appointment in a few taps.",
      description: "Press Start, pick a service and a day. We'll confirm your booking here.",
    },
    commands: [{ command: "start", description: "Book an appointment" }],
    rules: [
      { matchType: "command", pattern: "start", replyText: home, buttons: services },
      { matchType: "callback", pattern: "tpl_book_service", callbackAction: "edit", replyText: "Which day suits you best?", buttons: days },
      { matchType: "callback", pattern: "tpl_book_day_mon", callbackAction: "reply", replyText: "✅ Thanks {first_name}! We got your request for Monday. We'll confirm the time here shortly." },
      { matchType: "callback", pattern: "tpl_book_day_tue", callbackAction: "reply", replyText: "✅ Thanks {first_name}! We got your request for Tuesday. We'll confirm the time here shortly." },
      { matchType: "callback", pattern: "tpl_book_day_wed", callbackAction: "reply", replyText: "✅ Thanks {first_name}! We got your request for Wednesday. We'll confirm the time here shortly." },
      { matchType: "callback", pattern: "tpl_book_home", callbackAction: "edit", replyText: home, buttons: services },
      { matchType: "fallback", pattern: "*", replyText: "Thanks, we got your message! We'll reply here as soon as we can." },
    ],
  };
})();

const QUIZ: BotTemplate = (() => {
  const q1 = "🧠 Quick quiz! Question 1 of 3\n\nWhat is the capital of France?";
  const q1Buttons = [[cb("Paris", "tpl_quiz_q1_right"), cb("London", "tpl_quiz_wrong")]];
  return {
    id: "quiz",
    title: "Quiz game",
    blurb: "Three questions with answer buttons. A wrong answer pops up a hint, a right one moves to the next question.",
    emoji: "🧠",
    category: "Engagement",
    shows: ["Pop-up answers", "Moving to the next step", "Play again"],
    profile: {
      shortDescription: "Test yourself with a quick quiz.",
      description: "Press Start to play a short quiz. Three questions, answer by tapping a button.",
    },
    commands: [
      { command: "start", description: "Start the quiz" },
      { command: "quiz", description: "Play again" },
    ],
    rules: [
      { matchType: "command", pattern: "start", replyText: q1, buttons: q1Buttons },
      { matchType: "command", pattern: "quiz", replyText: q1, buttons: q1Buttons },
      { matchType: "callback", pattern: "tpl_quiz_wrong", callbackAction: "toast", replyText: "Not quite — try another answer! 🙂" },
      { matchType: "callback", pattern: "tpl_quiz_q1_right", callbackAction: "edit", replyText: "✅ Correct!\n\nQuestion 2 of 3\nWhich planet is called the Red Planet?", buttons: [[cb("Venus", "tpl_quiz_wrong"), cb("Mars", "tpl_quiz_q2_right")]] },
      { matchType: "callback", pattern: "tpl_quiz_q2_right", callbackAction: "edit", replyText: "✅ Correct!\n\nQuestion 3 of 3\nHow many days are in a week?", buttons: [[cb("5", "tpl_quiz_wrong"), cb("7", "tpl_quiz_q3_right")]] },
      { matchType: "callback", pattern: "tpl_quiz_q3_right", callbackAction: "edit", replyText: "🎉 You finished the quiz, {first_name}! Well done.", buttons: [[cb("🔁 Play again", "tpl_quiz_restart")]] },
      { matchType: "callback", pattern: "tpl_quiz_restart", callbackAction: "edit", replyText: q1, buttons: q1Buttons },
    ],
  };
})();

const EVENT: BotTemplate = {
  id: "event",
  title: "Event invitation",
  blurb: "An invitation with going / maybe / can't buttons. Every answer arrives in your Messages section, and the rule shows how many tapped it.",
  emoji: "🎉",
  category: "Engagement",
  shows: ["Reply to a button press", "Link button", "See answers in Messages"],
  profile: {
    shortDescription: "Join our event — tell us if you're coming.",
    description: "Press Start to see the event details and let us know if you can make it.",
  },
  commands: [{ command: "start", description: "See the event and RSVP" }],
  rules: [
    {
      matchType: "command",
      pattern: "start",
      replyText: "🎉 Summer meetup\n📅 Saturday, 14:00\n📍 Replace with your venue\n\nWill you join us, {first_name}?",
      buttons: [[cb("✅ I'm going", "tpl_event_yes"), cb("🤔 Maybe", "tpl_event_maybe"), cb("❌ Can't", "tpl_event_no")], [link("📍 Location", "https://maps.google.com")]],
    },
    { matchType: "callback", pattern: "tpl_event_yes", callbackAction: "reply", replyText: "Great, {first_name}! See you there 🎉" },
    { matchType: "callback", pattern: "tpl_event_maybe", callbackAction: "reply", replyText: "No problem — let us know when you decide." },
    { matchType: "callback", pattern: "tpl_event_no", callbackAction: "reply", replyText: "Sorry to miss you! We'll tell you about the next one." },
  ],
};

const COURSE: BotTemplate = (() => {
  const intro = "🎓 Welcome to the mini course, {first_name}!\n\nThree short lessons. Ready?";
  const introButtons = [[cb("Start lesson 1 ▶", "tpl_course_l1")]];
  return {
    id: "course",
    title: "Mini course",
    blurb: "Short lessons you move through with Back and Next buttons. Replace the text with your own lessons.",
    emoji: "🎓",
    category: "Engagement",
    shows: ["Next / Back buttons", "Step-by-step flow"],
    profile: {
      shortDescription: "A short course, one lesson at a time.",
      description: "Press Start to begin. Three short lessons, move on with the Next button.",
    },
    commands: [{ command: "start", description: "Start the course" }],
    rules: [
      { matchType: "command", pattern: "start", replyText: intro, buttons: introButtons },
      { matchType: "callback", pattern: "tpl_course_home", callbackAction: "edit", replyText: intro, buttons: introButtons },
      { matchType: "callback", pattern: "tpl_course_l1", callbackAction: "edit", replyText: "📘 Lesson 1\n\nWrite your first lesson here.", buttons: [[cb("Next ▶", "tpl_course_l2")]] },
      { matchType: "callback", pattern: "tpl_course_l2", callbackAction: "edit", replyText: "📗 Lesson 2\n\nWrite your second lesson here.", buttons: [[cb("◀ Back", "tpl_course_l1"), cb("Next ▶", "tpl_course_l3")]] },
      { matchType: "callback", pattern: "tpl_course_l3", callbackAction: "edit", replyText: "📙 Lesson 3\n\nWrite your last lesson here.", buttons: [[cb("◀ Back", "tpl_course_l2"), cb("🎓 Finish", "tpl_course_done")]] },
      { matchType: "callback", pattern: "tpl_course_done", callbackAction: "edit", replyText: "🎉 Congratulations, {first_name} — you finished the course!", buttons: [[cb("🔁 Start over", "tpl_course_home")]] },
    ],
  };
})();

const FEEDBACK: BotTemplate = {
  id: "feedback",
  title: "Feedback survey",
  blurb: "People rate you from 1 to 5 stars and get a fitting answer. Each rating arrives in your Messages section, and written comments are thanked.",
  emoji: "⭐",
  category: "Engagement",
  shows: ["Rating buttons", "Different answer per button", "Catch-all reply"],
  profile: {
    shortDescription: "Tell us how we're doing.",
    description: "Press Start and rate your experience from 1 to 5 stars. Your feedback helps us improve.",
  },
  commands: [{ command: "start", description: "Rate your experience" }],
  rules: [
    {
      matchType: "command",
      pattern: "start",
      replyText: "Hi {first_name}! How was your experience with us?",
      buttons: [[cb("1⭐", "tpl_fb_1"), cb("2⭐", "tpl_fb_2"), cb("3⭐", "tpl_fb_3"), cb("4⭐", "tpl_fb_4"), cb("5⭐", "tpl_fb_5")]],
    },
    { matchType: "callback", pattern: "tpl_fb_1", callbackAction: "edit", replyText: "😔 We're sorry. Tell us what went wrong — just write a message here." },
    { matchType: "callback", pattern: "tpl_fb_2", callbackAction: "edit", replyText: "Thanks for being honest. What could we do better? Write it here." },
    { matchType: "callback", pattern: "tpl_fb_3", callbackAction: "edit", replyText: "Thanks! Anything we could improve? Write it here." },
    { matchType: "callback", pattern: "tpl_fb_4", callbackAction: "edit", replyText: "😊 Thank you! Glad you liked it." },
    { matchType: "callback", pattern: "tpl_fb_5", callbackAction: "edit", replyText: "🌟 Thank you so much, {first_name}!" },
    { matchType: "fallback", pattern: "*", replyText: "🙏 Thanks for your feedback — we read every message." },
  ],
};

const NEWSLETTER: BotTemplate = {
  id: "newsletter",
  title: "News & updates",
  blurb: "Greets new people, answers keywords like “price” or “demo”, and has a /news command. Everyone who writes to the bot can later get your updates through Outbox.",
  emoji: "📣",
  category: "Engagement",
  shows: ["Keyword replies", "Commands", "Broadcast via Outbox"],
  profile: {
    shortDescription: "News and updates from us.",
    description: "Press Start to hear from us. Ask about prices or a demo any time.",
  },
  commands: [
    { command: "start", description: "Say hello" },
    { command: "news", description: "See our latest news" },
  ],
  rules: [
    { matchType: "command", pattern: "start", replyText: "Hi {first_name}! 📣 You're in. We'll send you our news here — send a broadcast from the Outbox section whenever you have something to share." },
    { matchType: "command", pattern: "news", replyText: "📰 Latest news\n\nWrite your newest announcement here." },
    { matchType: "contains", pattern: "price", replyText: "💶 You can find our prices here: https://example.com/prices (replace this link)." },
    { matchType: "contains", pattern: "demo", replyText: "🎬 Want a demo? Reply with your email and we'll set one up." },
  ],
};

const COMMUNITY: BotTemplate = {
  id: "community",
  title: "Group helper",
  blurb: "For a group: /rules and /help commands. Add the bot to your group. Keyword answers also need “privacy” turned off in Permissions, otherwise Telegram only sends the bot commands.",
  emoji: "👥",
  category: "Community",
  shows: ["Works in groups", "Commands", "Keyword replies"],
  profile: {
    shortDescription: "Rules and help for our community.",
    description: "Add me to your group. Type /rules to see the rules and /help to see what I can do.",
  },
  commands: [
    { command: "rules", description: "Show the group rules" },
    { command: "help", description: "See what I can do" },
  ],
  rules: [
    { matchType: "command", pattern: "rules", replyText: "📜 Group rules\n\n1. Be kind.\n2. No spam.\n3. Stay on topic.\n\n(Replace these with your own.)" },
    { matchType: "command", pattern: "help", replyText: "Hi {first_name}! Here is what I can do:\n{commands}" },
    { matchType: "contains", pattern: "where are the rules", replyText: "📜 Type /rules to see them." },
  ],
};

// --- Templates built on reply keyboards, deep links and Mini Apps ---------------------------------------------------
// Rules keep no state: a free-text answer can't be "the name" of a form. These flows move on with buttons or keyboard
// labels only, so every keyboard label is unique inside its template (an `exact` rule matches the text alone).

const kb = (rows: KeyboardButton[][], placeholder?: string): ReplyKeyboard => ({ kind: "keyboard", rows, resize: true, ...(placeholder ? { placeholder } : {}) });
const REMOVE_KB: ReplyKeyboard = { kind: "remove" };

const LEAD_CAPTURE: BotTemplate = (() => {
  const welcome = "Hi {first_name}! 👋 Want us to call you back?\n\nTap “Share my number” and we'll get in touch.";
  return {
    id: "lead-capture",
    title: "Lead capture",
    blurb: "Visitors tap one button to share their phone number so you can call them back. They can decline politely.",
    emoji: "📞",
    category: "Business",
    shows: ["Share-contact keyboard button", "Reply to a shared contact", "Keyboard removed afterwards"],
    profile: {
      shortDescription: "Leave your number and we'll call you back.",
      description: "Press Start, tap “Share my number” and we'll call you back. Your number is only used to contact you.",
    },
    commands: [{ command: "start", description: "Leave your number" }],
    rules: [
      {
        matchType: "command",
        pattern: "start",
        replyText: welcome,
        replyKeyboard: kb([[{ text: "📱 Share my number", request_contact: true }], [{ text: "No thanks" }]], "Share your number or say no thanks"),
      },
      { matchType: "media", pattern: "contact", replyText: "✅ Thanks {first_name}! We got your number and will call you back soon.", replyKeyboard: REMOVE_KB },
      { matchType: "exact", pattern: "No thanks", replyText: "No problem! You can write to us here any time.", replyKeyboard: REMOVE_KB },
      { matchType: "fallback", pattern: "*", replyText: "Thanks, we got your message! We'll reply here as soon as we can." },
    ],
  };
})();

const CAMPAIGN_LINKS: BotTemplate = {
  id: "campaign-links",
  title: "Campaign links",
  blurb: "A different welcome depending on which link brought the person (Instagram, a flyer, a friend). Great for ads and QR codes.",
  emoji: "🎯",
  category: "Business",
  shows: ["Deep-link welcomes", "Beats the plain /start rule", "Copy-code button"],
  profile: {
    shortDescription: "Welcome! Press Start to claim your offer.",
    description: "Press Start to see what we have for you.",
  },
  commands: [{ command: "start", description: "Get your welcome offer" }],
  rules: [
    // Deep-link payloads are case-sensitive; templates keep them lowercase. Create matching links in “Links & inline”.
    {
      matchType: "deeplink",
      pattern: "instagram",
      replyText: "Hi {first_name}! 📸 Thanks for coming from Instagram. Here's your welcome code:",
      buttons: [[copy("📋 Copy code INSTA10", "INSTA10")]],
    },
    {
      matchType: "deeplink",
      pattern: "flyer",
      replyText: "Hi {first_name}! 📄 Nice to see you from our flyer. Here's your welcome code:",
      buttons: [[copy("📋 Copy code FLYER10", "FLYER10")]],
    },
    {
      matchType: "deeplink",
      pattern: "friend",
      replyText: "Hi {first_name}! 🤝 A friend sent you here (link: {payload}). Here's your welcome code:",
      buttons: [[copy("📋 Copy code FRIEND10", "FRIEND10")]],
    },
    {
      matchType: "command",
      pattern: "start",
      replyText: "Welcome, {first_name}! 🎉 Here's a code for your first order:",
      buttons: [[copy("📋 Copy code WELCOME10", "WELCOME10")], [link("🌐 Visit our website", "https://example.com")]],
    },
  ],
};

const STORE_LOCATOR: BotTemplate = (() => {
  const list = "• City centre – Main Street 1\n• Riverside – River Road 25\n• Airport – Terminal 2\n\n(Replace with your own stores.)";
  const stores = `🏬 Our stores\n\n${list}`;
  const storeButtons = [[link("🗺 City centre", "https://maps.google.com")], [link("🗺 Riverside", "https://maps.google.com")], [link("🗺 Airport", "https://maps.google.com")]];
  return {
    id: "store-locator",
    title: "Store locator",
    blurb: "People share their location (or ask for the full list) and get your stores with map links.",
    emoji: "📍",
    category: "Business",
    shows: ["Share-location keyboard button", "Reply to a shared location", "Map link buttons"],
    profile: {
      shortDescription: "Find the nearest store.",
      description: "Press Start, share your location and we'll show you our stores with directions.",
    },
    commands: [{ command: "start", description: "Find a store near you" }],
    rules: [
      {
        matchType: "command",
        pattern: "start",
        replyText: "Hi {first_name}! 📍 Share your location and we'll show you our stores, or browse them all.",
        replyKeyboard: kb([[{ text: "📍 Send my location", request_location: true }], [{ text: "🏬 See all stores" }]]),
      },
      { matchType: "media", pattern: "location", replyText: `Thanks for sharing! Here are our stores, tap one for directions:\n\n${list}`, buttons: storeButtons },
      { matchType: "exact", pattern: "🏬 See all stores", replyText: stores, buttons: storeButtons },
      { matchType: "fallback", pattern: "*", replyText: "Tap “Send my location” or “See all stores” below, or write to us and we'll answer here." },
    ],
  };
})();

const KEYBOARD_SURVEY: BotTemplate = (() => {
  const q2 = "Question 2 of 3\n\nHow often would you use us?";
  const q3 = "Question 3 of 3\n\nWould you recommend us to a friend?";
  const kb2 = kb([[{ text: "📅 Daily" }, { text: "🗓 Weekly" }, { text: "🌙 Rarely" }]]);
  const kb3 = kb([[{ text: "👍 Yes" }, { text: "🤔 Maybe" }, { text: "👎 No" }]]);
  const answers = (labels: string[], replyText: string, replyKeyboard: ReplyKeyboard): TemplateRule[] =>
    labels.map((pattern) => ({ matchType: "exact", pattern, replyText, replyKeyboard }));
  return {
    id: "keyboard-survey",
    title: "Quick survey",
    blurb: "Three questions answered with big keyboard buttons, one after the other. Read the answers in Messages.",
    emoji: "📝",
    category: "Engagement",
    shows: ["Step-by-step keyboard flow", "Keyboard replaced each step", "Keyboard removed at the end"],
    profile: {
      shortDescription: "Answer 3 quick questions.",
      description: "Press Start and tap an answer for each question. It takes less than a minute.",
    },
    commands: [{ command: "start", description: "Start the survey" }],
    rules: [
      {
        matchType: "command",
        pattern: "start",
        replyText: "Hi {first_name}! 📝 Three quick questions.\n\nQuestion 1 of 3\n\nHow did you hear about us?",
        replyKeyboard: kb([[{ text: "👥 Friends" }, { text: "📱 Social media" }], [{ text: "🔎 Search" }, { text: "✨ Other" }]]),
      },
      ...answers(["👥 Friends", "📱 Social media", "🔎 Search", "✨ Other"], q2, kb2),
      ...answers(["📅 Daily", "🗓 Weekly", "🌙 Rarely"], q3, kb3),
      ...answers(["👍 Yes", "🤔 Maybe", "👎 No"], "🎉 Thank you {first_name}, that's all! Your answers will help us improve.", REMOVE_KB),
      { matchType: "fallback", pattern: "*", replyText: "Please tap one of the answer buttons, or press /start to begin again." },
    ],
  };
})();

const MINI_APP: BotTemplate = (() => {
  const home = "Welcome, {first_name}! 🚀\nOpen our app below, or ask us anything.";
  const menu = [[{ text: "🚀 Open the app", web_app: { url: "https://example.com/app" } }], [cb("❓ Help", "tpl_app_help")], [cb("📬 Contact", "tpl_app_contact")]];
  const back = [[cb("⬅️ Back", "tpl_app_home")]];
  return {
    id: "mini-app",
    title: "Mini App launcher",
    blurb: "A welcome with a button that opens your web app inside Telegram. Replace the address with your own app.",
    emoji: "🚀",
    category: "Getting started",
    shows: ["Mini App button", "Button menu", "Back buttons"],
    profile: {
      shortDescription: "Open our app right here in Telegram.",
      description: "Press Start, then tap “Open the app”. No download needed.",
    },
    commands: [
      { command: "start", description: "Open the app" },
      { command: "help", description: "How to use the app" },
    ],
    rules: [
      { matchType: "command", pattern: "start", replyText: home, buttons: menu },
      { matchType: "command", pattern: "help", replyText: "Tap “Open the app” in the /start message. Questions? Just write to us here.\n\n{commands}" },
      { matchType: "callback", pattern: "tpl_app_help", callbackAction: "edit", replyText: "❓ Help\n\nTap “Open the app” to use it inside Telegram. The app button only works in a private chat with the bot.", buttons: back },
      { matchType: "callback", pattern: "tpl_app_contact", callbackAction: "edit", replyText: "📬 Contact\n\nWrite your message here and we'll reply.\n(Replace with your contact details.)", buttons: back },
      { matchType: "callback", pattern: "tpl_app_home", callbackAction: "edit", replyText: home, buttons: menu },
    ],
  };
})();

export const BOT_TEMPLATES: BotTemplate[] = [
  WELCOME_MENU, LINK_HUB, FAQ, SUPPORT, CAFE, SHOP, BOOKING, QUIZ, EVENT, COURSE, FEEDBACK, NEWSLETTER, COMMUNITY,
  LEAD_CAPTURE, CAMPAIGN_LINKS, STORE_LOCATOR, KEYBOARD_SURVEY, MINI_APP,
];

export const getBotTemplate = (id: string): BotTemplate | undefined => BOT_TEMPLATES.find((t) => t.id === id);

/** What identifies a rule for "already there" checks (commands are stored lowercase without the slash). */
export const templateRuleKey = (r: { matchType: string; pattern: string }) => `${r.matchType}:${r.pattern.trim().toLowerCase()}`;

export const TEMPLATE_PARTS = ["profile", "commands", "rules", "monitoring"] as const;
export type TemplatePart = (typeof TEMPLATE_PARTS)[number];

export const CUSTOM_TEMPLATE_PREFIX = "custom-";

// --- Removing a template: only what is still exactly as the template made it ---------------------------------------

/** The slice of a stored rule the comparison needs (a rule row with its JSON columns already parsed). */
export interface StoredRuleLike {
  id: number;
  matchType: string;
  pattern: string;
  replyText: string;
  parseMode: string | null;
  buttons: InlineButton[][] | null;
  replyKeyboard: ReplyKeyboard | null;
  callbackAction: string;
  media: RuleMediaRef | null;
  followUps: FollowUp[];
}

/** JSON with sorted keys, so two buttons that differ only in key order compare equal. */
function canon(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** What storing `rule` keeps (mirrors `columnsFor` in lib/auto-replies.ts), so it can be compared with a stored row. */
function expectedColumns(rule: TemplateRule) {
  const isCallback = rule.matchType === "callback" || rule.matchType === "callback_prefix";
  const action = isCallback ? rule.callbackAction ?? "toast" : "toast";
  const sends = !isCallback || action !== "toast";
  const buttons = sends ? normalizeInlineButtons(rule.buttons) : null;
  const rich = sends && action !== "edit";
  return {
    media: rich ? rule.media ?? null : null,
    followUps: rich ? normalizeFollowUps(rule.followUps) ?? [] : [],
    parseMode: sends ? rule.parseMode ?? null : null,
    buttons,
    replyKeyboard: sends && action !== "edit" && !buttons?.length && rule.replyKeyboard ? normalizeReplyKeyboard(rule.replyKeyboard) : null,
    callbackAction: action,
  };
}

/** Whether a stored rule is still what `rule` would create (switching it off does not count as changing it). */
export function ruleIsUnchanged(stored: StoredRuleLike, rule: TemplateRule): boolean {
  const want = expectedColumns(rule);
  return (
    stored.replyText === rule.replyText &&
    stored.parseMode === want.parseMode &&
    stored.callbackAction === want.callbackAction &&
    canon(stored.buttons?.length ? stored.buttons : null) === canon(want.buttons?.length ? want.buttons : null) &&
    canon(stored.replyKeyboard ?? null) === canon(want.replyKeyboard ?? null) &&
    // A stored attachment is a different file than any the template could name, so any attachment counts as an edit.
    (stored.media?.mediaId ?? null) === (want.media?.mediaId ?? null) &&
    canon(stored.followUps) === canon(want.followUps)
  );
}

export interface TemplateRemoval<R extends StoredRuleLike> {
  /** Stored rules that are still as the template made them: these can be deleted. */
  rules: R[];
  /** Rules with the template's trigger that were edited since (kept). */
  keptRules: R[];
  /** Commands with the template's name and description (removable), and with its name but another description (kept). */
  commands: string[];
  keptCommands: string[];
}

/**
 * What "remove this template" would delete from a bot with these rules and commands. Pure, so the dashboard can show
 * the counts (and hide the button when there is nothing to remove) and the server deletes exactly the same set.
 */
export function planRemoval<R extends StoredRuleLike>(
  template: Pick<BotTemplate, "rules" | "commands">,
  stored: readonly R[],
  commands: readonly { command: string; description: string }[]
): TemplateRemoval<R> {
  const out: TemplateRemoval<R> = { rules: [], keptRules: [], commands: [], keptCommands: [] };
  for (const rule of template.rules) {
    const found = stored.find((s) => templateRuleKey(s) === templateRuleKey(rule));
    if (!found || out.rules.includes(found) || out.keptRules.includes(found)) continue;
    (ruleIsUnchanged(found, rule) ? out.rules : out.keptRules).push(found);
  }
  for (const c of template.commands) {
    const have = commands.find((x) => x.command.toLowerCase() === c.command);
    if (!have) continue;
    (have.description === c.description ? out.commands : out.keptCommands).push(c.command);
  }
  return out;
}
