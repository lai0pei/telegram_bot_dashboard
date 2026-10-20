"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { validateLanguageCode } from "@/lib/validation";
import { FieldError } from "@/components/ui/field-error";
import { COMMON_LANGUAGES } from "@/lib/languages";

const COMMON = COMMON_LANGUAGES;
const OTHER = "__other__";

/**
 * Picks the language a bot setting applies to. "" means the default for all languages.
 * Calls onChange only with a valid code (or ""), so callers can use the value directly.
 */
export function LanguageSelect({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [custom, setCustom] = useState(value !== "" && !COMMON.includes(value));
  const [draft, setDraft] = useState(custom ? value : "");
  const error = custom && draft ? validateLanguageCode(draft) : null;

  return (
    <div className="flex flex-wrap items-start gap-2">
      <select
        aria-label="Language"
        value={custom ? OTHER : value}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setCustom(true);
            return;
          }
          setCustom(false);
          setDraft("");
          onChange(e.target.value);
        }}
        className="h-9 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <option value="">Default (all languages)</option>
        {COMMON.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
        <option value={OTHER}>Other…</option>
      </select>
      {custom && (
        <div className="space-y-1">
          <Input
            aria-label="Language code"
            placeholder="e.g. nl"
            maxLength={2}
            value={draft}
            className="w-24"
            onChange={(e) => {
              const next = e.target.value.toLowerCase();
              setDraft(next);
              if (next && !validateLanguageCode(next)) onChange(next);
            }}
          />
          <FieldError error={error} />
        </div>
      )}
    </div>
  );
}
