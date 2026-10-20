import type { InlineButton, ReplyKeyboard } from "@/lib/botapi";
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
}

export const emptyRuleDraft = (): RuleDraft => ({
  matchType: "command",
  pattern: "",
  replyText: "",
  parseMode: "",
  showAlert: false,
  callbackAction: "toast",
  buttons: [],
  keyboard: emptyKeyboardDraft(),
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
  };
}

export const isCallbackType = (t: AutoReplyMatchType) => t === "callback" || t === "callback_prefix";

/** A callback rule that only shows a pop-up carries neither formatting, buttons nor a keyboard. */
export const isToastOnly = (d: Pick<RuleDraft, "matchType" | "callbackAction">) => isCallbackType(d.matchType) && d.callbackAction === "toast";

/** The inline buttons and reply keyboard the rule would actually store (mirrors the server's `columnsFor`). */
export function draftOutputs(d: RuleDraft): { buttons: InlineButton[][] | undefined; replyKeyboard: ReplyKeyboard | undefined } {
  const toast = isToastOnly(d);
  const editsMessage = isCallbackType(d.matchType) && d.callbackAction === "edit";
  return {
    buttons: toast ? undefined : draftsToButtons(d.buttons),
    replyKeyboard: toast || editsMessage ? undefined : draftToReplyKeyboard(d.keyboard),
  };
}

/** The JSON body for POST / PATCH `/auto-replies`. */
export function draftToBody(d: RuleDraft) {
  const { buttons, replyKeyboard } = draftOutputs(d);
  return {
    matchType: d.matchType,
    pattern: d.pattern,
    replyText: d.replyText,
    parseMode: d.parseMode || null,
    buttons: buttons ?? null,
    replyKeyboard: replyKeyboard ?? null,
    showAlert: d.showAlert,
    callbackAction: d.callbackAction,
  };
}

/** Validation message for the draft, or null (also null while the pattern and reply are both still empty). */
export function draftError(d: RuleDraft): string | null {
  if (!d.pattern && !d.replyText) return null;
  const { buttons, replyKeyboard } = draftOutputs(d);
  return (
    validateAutoReply({ matchType: d.matchType, pattern: d.pattern, replyText: d.replyText, parseMode: d.parseMode, buttons, replyKeyboard, callbackAction: d.callbackAction }) ??
    keyboardDraftError(d.keyboard)
  );
}

export const draftCanSave = (d: RuleDraft) => Boolean(d.pattern.trim() && d.replyText.trim()) && !draftError(d);
