import { RULE_MEDIA_LABELS, followUpSummary, type RuleMediaRef } from "@/lib/rule-content";
import { draftOutputs, isToastOnly, type RuleDraft } from "./rule-draft";
import type { PreviewMessage } from "./telegram-preview";

/** What the person would have done to trigger the rule, as the preview's first bubble (none for a button press). */
function triggerText(d: RuleDraft): string | null {
  const p = d.pattern.trim();
  switch (d.matchType) {
    case "command":
      return `/${p.replace(/^\//, "") || "command"}`;
    case "exact":
    case "contains":
    case "starts_with":
      return p || "…";
    case "regex":
      return "A message matching the pattern";
    case "member_joined":
      return "[someone joined the group]";
    case "reaction":
      return `[reacts ${p && p !== "*" ? p : "👍"} to a bot message]`;
    case "deeplink":
      return `/start ${p || "code"}`;
    case "media":
      return `[${p.replace("_", " ") || "file"}]`;
    case "shared":
      return "[shared a contact or chat]";
    case "fallback":
      return "Something no rule knows";
    default:
      return null;
  }
}

/** How a rule's reply will look in Telegram, from the form's current state. */
export function previewOf(d: RuleDraft, botId: number): { messages: PreviewMessage[]; keyboard: ReturnType<typeof draftOutputs>["replyKeyboard"] } {
  const { buttons, replyKeyboard, media, followUps } = draftOutputs(d);
  const trigger = triggerText(d);
  const messages: PreviewMessage[] = [];
  if (trigger) messages.push({ from: "user", text: trigger });
  const text = d.replyText || (media ? "" : "Your reply appears here.");
  if (isToastOnly(d)) messages.push({ from: "bot", text, toast: true });
  else {
    messages.push({ from: "bot", text, parseMode: d.parseMode, buttons, media: media && previewMedia(media, botId) });
    for (const f of followUps ?? []) {
      if (f.kind === "text") messages.push({ from: "bot", text: f.text, parseMode: f.parseMode, buttons: f.buttons });
      else if (f.kind === "media") messages.push({ from: "bot", text: f.caption ?? "", parseMode: f.parseMode, buttons: f.buttons, media: f.media ? previewMedia(f.media, botId) : undefined });
      else messages.push({ from: "bot", text: followUpSummary(f) });
    }
  }
  return { messages, keyboard: replyKeyboard };
}

/** A stored attachment as the phone mock draws it: a picture from the bot's rule storage, or a file chip. */
function previewMedia(ref: RuleMediaRef, botId: number): PreviewMessage["media"] {
  const picture = ref.kind === "photo" || ref.kind === "sticker";
  return { kind: picture ? "photo" : "file", name: ref.name || RULE_MEDIA_LABELS[ref.kind], src: picture ? `/api/bots/${botId}/rule-media/${ref.mediaId}` : undefined };
}
