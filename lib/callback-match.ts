/**
 * Which rule answers a pressed inline button. Pure (no database), so the poller and the dashboard's conversation
 * builder use the very same logic and can't drift apart: the first enabled rule wins, an exact rule for the button's
 * data or a prefix rule whose pattern the data starts with.
 */
export function findCallbackRule<T extends { enabled: boolean; matchType: string; pattern: string }>(rules: readonly T[], data: string): T | undefined {
  return rules.find((r) => r.enabled && ((r.matchType === "callback" && r.pattern === data) || (r.matchType === "callback_prefix" && data.startsWith(r.pattern))));
}
