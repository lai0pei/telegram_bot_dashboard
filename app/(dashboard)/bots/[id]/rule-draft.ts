import type { InlineButton, ReplyKeyboard } from "@/lib/botapi";
import type { FollowUp, RuleMediaRef } from "@/lib/rule-content";
import { validateAutoReply } from "@/lib/validation";
import { buttonsToDrafts, draftsToButtons, type ButtonDraft } from "./buttons-editor";
import { draftToReplyKeyboard, emptyKeyboardDraft, keyboardDraftError, replyKeyboardToDraft, type KeyboardDraft } from "./keyboard-editor";
import type { AutoReplyMatchType, AutoReplyRule, CallbackAction, ParseModeChoice } from "./types";

/**
 * Everything the rule form edits, in one object so the Automation form, the setup checklist and the conversation
 * builder share one set of conversions instead of each keeping ten separate `useState`s.
 */
export interface RuleDraft {
  matchType: AutoReplyMatchType;
  pattern: string;
  replyText: string;
  parseMode: ParseModeChoice;
  showAlert: boolean;
  callbackAction: CallbackAction;
  buttons: ButtonDraft[];
  keyboard: KeyboardDraft;
  /** A file attached to the main message (then `replyText` is its caption). */
  media: RuleMediaRef | null;
  followUps: FollowUpDraft[];
}

/**
 * A follow-up as the form edits it: coordinates stay text so "-" and "12." can be typed, and a media follow-up may not
 * have its file yet (validation then says so).
 */
export type FollowUpDraft =
  | Exclude<FollowUp, { kind: "location" | "media" }>
  | (Omit<Extract<FollowUp, { kind: "location" }>, "latitude" | "longitude"> & { latitude: string; longitude: string })
  | (Omit<Extract<FollowUp, { kind: "media" }>, "media"> & { media: RuleMediaRef | null });

export const followUpToDraft = (f: FollowUp): FollowUpDraft =>
  f.kind === "location" ? { ...f, latitude: String(f.latitude), longitude: String(f.longitude) } : f;

export const draftToFollowUp = (f: FollowUpDraft): FollowUp => {
  if (f.kind === "location") {
    return { ...f, latitude: f.latitude.trim() === "" ? NaN : Number(f.latitude), longitude: f.longitude.trim() === "" ? NaN : Number(f.longitude) };
  }
  // A missing file stays null so the shared validator reports it ("The attached file is missing.").
  return f as FollowUp;
};

export const emptyRuleDraft = (): RuleDraft => ({
  matchType: "command",
  pattern: "",
  replyText: "",
  parseMode: "",
  showAlert: false,
  callbackAction: "toast",
  buttons: [],
  keyboard: emptyKeyboardDraft(),
  media: null,
  followUps: [],
});

export function ruleToDraft(rule: AutoReplyRule): RuleDraft {
  return {
    matchType: rule.matchType,
    pattern: rule.pattern,
    replyText: rule.replyText,
    parseMode: rule.parseMode ?? "",
    showAlert: rule.showAlert,
    callbackAction: rule.callbackAction ?? "toast",
    buttons: buttonsToDrafts(rule.buttons),
    keyboard: replyKeyboardToDraft(rule.replyKeyboard),
    media: rule.media ?? null,
    followUps: (rule.followUps ?? []).map(followUpToDraft),
  };
}

export const isCallbackType = (t: AutoReplyMatchType) => t === "callback" || t === "callback_prefix";

/** A callback rule that only shows a pop-up carries neither formatting, buttons nor a keyboard. */
export const isToastOnly = (d: Pick<RuleDraft, "matchType" | "callbackAction">) => isCallbackType(d.matchType) && d.callbackAction === "toast";

/** The inline buttons, reply keyboard, attachment and follow-ups the rule would actually store (mirrors the server's `columnsFor`). */
export function draftOutputs(d: RuleDraft): {
  buttons: InlineButton[][] | undefined;
  replyKeyboard: ReplyKeyboard | undefined;
  media: RuleMediaRef | undefined;
  followUps: FollowUp[] | undefined;
} {
  const toast = isToastOnly(d);
  const editsMessage = isCallbackType(d.matchType) && d.callbackAction === "edit";
  const rich = !toast && !editsMessage;
  return {
    buttons: toast ? undefined : draftsToButtons(d.buttons),
    replyKeyboard: toast || editsMessage ? undefined : draftToReplyKeyboard(d.keyboard),
    media: rich ? d.media ?? undefined : undefined,
    followUps: rich && d.followUps.length ? d.followUps.map(draftToFollowUp) : undefined,
  };
}

/** The JSON body for POST / PATCH `/auto-replies`. */
export function draftToBody(d: RuleDraft) {
  const { buttons, replyKeyboard, media, followUps } = draftOutputs(d);
  return {
    matchType: d.matchType,
    pattern: d.pattern,
    replyText: d.replyText,
    parseMode: d.parseMode || null,
    buttons: buttons ?? null,
    replyKeyboard: replyKeyboard ?? null,
    showAlert: d.showAlert,
    callbackAction: d.callbackAction,
    media: media ?? null,
    followUps: followUps ?? null,
  };
}

/** Validation message for the draft, or null (also null while the pattern and reply are both still empty). */
export function draftError(d: RuleDraft): string | null {
  if (!d.pattern && !d.replyText) return null;
  const { buttons, replyKeyboard, media, followUps } = draftOutputs(d);
  return (
    validateAutoReply({
      matchType: d.matchType,
      pattern: d.pattern,
      replyText: d.replyText,
      parseMode: d.parseMode,
      buttons,
      replyKeyboard,
      callbackAction: d.callbackAction,
      media,
      followUps,
    }) ??
    keyboardDraftError(d.keyboard)
  );
}

export const draftCanSave = (d: RuleDraft) => Boolean(d.pattern.trim() && (d.replyText.trim() || draftOutputs(d).media)) && !draftError(d);
