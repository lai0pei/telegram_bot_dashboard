# Templates as its own tab, with one-click Apply / Remove

## Context
Templates is currently hidden inside the bot page's **Build** dropdown. Applying or removing a template means opening its
detail screen. Removing only appears there, in an "Already added?" card. The gallery never shows which templates are
already on the bot. The user wants Templates as its own tab, where a template can be applied and removed straight from
the gallery.

Decisions (confirmed with user):
- Templates becomes a **standalone top-level tab** (a plain button, right after Overview).
- "Delete" means **remove the template from this bot**: the existing `DELETE /api/bots/[id]/templates`, which deletes
  only rules and commands still exactly as the template made them. Deleting saved custom templates stays where it is
  (on the detail screen).
- **Buttons on each card**: an "Added" badge plus Apply / Remove. Clicking the card still opens the detail screen
  (Try it, choose parts).

No API, schema or `lib/` changes are needed. "Applied" is worked out on the client with the existing pure `planRemoval`.

## Changes

### 1. `app/(dashboard)/bots/[id]/sections.ts`
- Remove `{ id: "templates", … }` from the Build group.
- Add a new single-section group right after Overview: `{ label: null, sections: [{ id: "templates", label: "Templates", icon: LayoutTemplate }] }`.
  `bot-shell.tsx` already renders single-section groups as plain buttons and builds the mobile `<select>` from
  `SECTION_GROUPS`. Check that a second `label: null` group renders well in both. If the `<select>` needs an
  `<optgroup>` label, use the label "Templates".
- `?s=templates` keeps resolving, so links from the empty rules list, the bot cards and `openSection("templates")` in `page.tsx` keep working.

### 2. `app/(dashboard)/bots/[id]/template-picker.tsx`
- `TemplateCard` is a `<button role="radio">`. Action buttons can't be nested inside it, so add optional props:
  `status?: "added" | null` and `actions?: React.ReactNode`. When `actions` is given, render the card as a `div.card`
  containing the existing clickable button (whole top area, same classes and aria), then an action row underneath.
  Without `actions`, the markup stays exactly as it is, so the new-bot page, the compact rules list and the bot cards don't change.
- An "✓ Added" pill sits next to the "Start here" pill when `status === "added"`.
- `TemplatePicker` gets an optional `renderCard?: (t) => { status, actions }` that is passed through to each card.

### 3. `app/(dashboard)/bots/[id]/templates-section.tsx` (gallery screen)
- Rules are already loaded (`rules` state, refreshed by `version`). For each template, compute
  `planRemoval(t, rules, bot.commands ?? [])`. **Added** = `plan.rules.length + plan.commands.length > 0`.
  This is the same check the detail screen's "Already added?" card uses, so the two always agree.
- Card actions:
  - Not added: **Apply** runs `applyTemplate(t, quickParts, false)` from the existing `useApplyTemplate`.
    `quickParts` = `ALL_PARTS`, minus `monitoring` when a webhook is set or monitoring is already on (the same rule as
    `chosen` on the detail screen; pull that into a small helper used by both). Profile texts are never overwritten
    from the quick button.
  - Added: **Remove** opens the existing remove confirm dialog. The removed/kept counts come from the template's plan.
  - **Details** (or a click on the card) runs `open(t.id)`, as today.
- Pull `remove()` and the remove `Dialog` out so they take a `BotTemplate` argument instead of the closed-over
  `template`. That way the gallery and the detail screen share one implementation. Keep one `pendingId` / `busyId`
  so only that card's buttons show a spinner.
- After Apply or Remove, show the toasts that `useApplyTemplate` and `remove()` already raise. Per-part results stay on
  the detail screen. A failed part shows "Some parts could not be added — open Details".
- While `rules === null`, show no badges and disable the actions, so nothing is decided on stale data.

### 4. Docs
- `CLAUDE.md`, Frontend paragraph: Build no longer holds Templates. Templates is its own tab after Overview, with
  Apply/Remove on each card, and "added" derived from `planRemoval`.

## Reuse (no new logic)
- `planRemoval`, `templateRuleKey`: `lib/bot-templates.ts`
- `useApplyTemplate`, `ALL_PARTS`, `useTemplates`: `template-picker.tsx`
- `DELETE /api/bots/[id]/templates`: `app/api/bots/[id]/templates/route.ts`

## Edge cases
- Rules taken from a template and then edited don't count toward "Added". A template whose rules were *all* edited
  shows as not added, and Remove isn't offered, which is correct because Remove would delete nothing.
- Applying a second template keeps an existing `/start` rule, so the second template may show "Added" for only its
  other rules. That's fine, and Remove still deletes only that template's unchanged items.
- Saved (custom) templates get the same buttons. Deleting the saved template itself stays on the detail screen.

## Verification
1. `npx tsc --noEmit` and `npm run lint`.
2. `npm run dev`, open a bot:
   - The section bar shows "Templates" as a plain button after Overview, not inside Build. Below `lg`, the `<select>` lists it.
   - Apply "Getting started" from its card: a toast, the card shows "✓ Added", and the rules appear in All rules.
   - Remove it from the card: the confirm dialog shows counts. After confirming, the badge goes away and the rules are gone.
   - Edit one of a template's rules, then Remove: the edited rule is kept (toast/dialog says so).
   - With a webhook set, Apply doesn't try to turn on monitoring.
   - The new-bot page and the empty All rules compact picker look unchanged.
   - An old `?s=templates&template=<id>` link still opens the detail screen.
