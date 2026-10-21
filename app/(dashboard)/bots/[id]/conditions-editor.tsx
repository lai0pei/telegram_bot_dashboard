"use client";

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_SCOPE,
  SCOPE_EDITABLE,
  conditionsSummary,
  normalizeConditions,
  scopeOf,
  type ChatScope,
  type RuleConditions,
} from "@/lib/rule-conditions";

const select = "h-10 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 text-sm";
const SCOPE_LABELS: Record<ChatScope, string> = { private: "Private chats only", groups: "Groups only", any: "Private chats and groups" };
const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

function timeZones(): string[] {
  const own = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const all = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  return [...new Set([own, "UTC", ...all])];
}

/** Where, when and how often a message rule applies. Closed by default; opens when something is set. */
export function ConditionsEditor({
  matchType,
  value,
  onChange,
  idPrefix,
}: {
  matchType: string;
  value: RuleConditions | null;
  onChange: (value: RuleConditions | null) => void;
  idPrefix: string;
}) {
  const zones = useMemo(() => timeZones(), []);
  const set = (patch: Partial<RuleConditions>) => onChange(normalizeConditions({ ...value, ...patch }));
  const scope = scopeOf(matchType, value);
  const hours = value?.hours;
  const summary = conditionsSummary(matchType, value);

  return (
    <details className="rounded-lg border border-[var(--card-border)] px-3 py-2" open={summary.length > 0 || undefined}>
      <summary className="cursor-pointer select-none text-sm font-medium">
        When it applies{summary.length > 0 && <span className="ml-2 text-xs font-normal text-[var(--muted)]">{summary.join(" · ")}</span>}
      </summary>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={`${idPrefix}-scope`} className="shrink-0">
            Where
          </Label>
          {SCOPE_EDITABLE.has(matchType) ? (
            <select id={`${idPrefix}-scope`} className={select} value={scope} onChange={(e) => set({ chats: e.target.value as ChatScope })}>
              {(["private", "groups", "any"] as const).map((s) => (
                <option key={s} value={s}>
                  {SCOPE_LABELS[s]}
                  {s === DEFAULT_SCOPE[matchType] ? " (default)" : ""}
                </option>
              ))}
            </select>
          ) : (
            <span id={`${idPrefix}-scope`} className="text-sm text-[var(--muted)]">
              {SCOPE_LABELS[scope]} (fixed for this kind of rule)
            </span>
          )}
        </div>
        {SCOPE_EDITABLE.has(matchType) && scope !== "private" && matchType !== "command" && (
          <p className="text-xs text-[var(--muted)]">
            In a group the bot only sees every message when its privacy mode is off (or it is an admin), and it will answer each matching message there.
          </p>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={value?.oncePerUser === true} onChange={(e) => set({ oncePerUser: e.target.checked })} />
          Answer each person only once (later matches go to the next rule)
        </label>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Label htmlFor={`${idPrefix}-cooldown`} className="shrink-0">
            Wait before answering the same person again
          </Label>
          <Input
            id={`${idPrefix}-cooldown`}
            type="number"
            min={0}
            className="h-9 w-24"
            value={value?.cooldownSec ? Math.round(value.cooldownSec / 60) : 0}
            onChange={(e) => set({ cooldownSec: Math.max(0, Math.round(Number(e.target.value) || 0)) * 60 })}
          />
          <span className="text-xs text-[var(--muted)]">minutes (0 = no wait)</span>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(hours)}
              onChange={(e) => onChange(normalizeConditions({ ...value, hours: e.target.checked ? { from: 9, to: 18, tz: zones[0] } : undefined }))}
            />
            Only at certain times
          </label>
          {hours && (
            <div className="space-y-2 pl-6">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <select aria-label="From hour" className={select} value={hours.from} onChange={(e) => set({ hours: { ...hours, from: Number(e.target.value) } })}>
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
                to
                <select aria-label="To hour" className={select} value={hours.to} onChange={(e) => set({ hours: { ...hours, to: Number(e.target.value) } })}>
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
                <select aria-label="Time zone" className={`${select} max-w-56`} value={hours.tz} onChange={(e) => set({ hours: { ...hours, tz: e.target.value } })}>
                  {zones.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </div>
              {hours.from === hours.to && <p className="text-xs text-[var(--muted)]">Same start and end means all day.</p>}
              {hours.from > hours.to && <p className="text-xs text-[var(--muted)]">Runs past midnight, until {String(hours.to).padStart(2, "0")}:00 the next day.</p>}
              <div className="flex flex-wrap gap-3 text-xs">
                {DAYS.map((d) => {
                  const on = !hours.days?.length || hours.days.includes(d.value);
                  return (
                    <label key={d.value} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => {
                          const current = hours.days?.length ? hours.days : [0, 1, 2, 3, 4, 5, 6];
                          const next = e.target.checked ? [...current, d.value] : current.filter((x) => x !== d.value);
                          // Every day ticked = no restriction; none ticked can't mean "never", so it also means every day.
                          set({ hours: { ...hours, days: next.length === 7 || next.length === 0 ? undefined : next } });
                        }}
                      />
                      {d.label}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
