# Report Builder: fixing card on the right

**Date:** 2026-10-26
**Repo:** frontend only (no backend, DB or endpoint change)
**Mockup:** https://claude.ai/artifact/EYTYDKhQFHArM9k6tsLoyb (option E)

## Why
The yellow "You're fixing" box sits on top of the section text and pushes it down,
and the left list takes space the PM doesn't need while fixing.

## What the PM sees
- The yellow box becomes its own card on the right of the Build page.
- Only one side is open at a time, so the page width never changes:
  - **Fixing** (default when the PM arrives from a Fix button): the section list
    folds into a thin strip on the left, the fixing card is open on the right.
  - **List** (the PM clicks » on the strip): the list opens, the fixing card
    folds into a thin yellow strip on the right ("You're fixing · N problems").
    Clicking that strip opens the card again and folds the list.
- A section with no findings has no right card at all: the list stays open,
  same as today.
- Opened from the list (not from Fix), a section with findings shows the card
  folded, so the list stays open; the PM can open the card to read the findings.
- The middle (text + AI box) is unchanged.

## Steps
1. `components/report/SectionFindingsBanner.tsx`: restyle as a right-hand card
   (title "Validation", "You're fixing" box, "Also in this section" list,
   "Back to validation" at the bottom) plus a folded strip view. Takes `folded`
   and `onToggle` props.
2. `app/(protected)/pm/cycles/[id]/build/page.tsx`:
   - one state `side: "fix" | "list"`. Starts as `"fix"` when the URL has
     `fix`/`todo`, else `"list"`. Picking a section from the list sets `"list"`.
   - left card: when `side === "fix"` and the section has findings, show a
     thin strip with a » button instead of the full list.
   - move the banner from the top of the right panel to a third column.
3. Type-check (`npx tsc --noEmit`) and run `npx tsx lib/validation-fixes.test.ts`.
4. Check in the browser on Final Testing Monday: Fix → card open, list folded;
   » → list open, card folded; card strip → back.

## Not changing
- The Validation page, the AI box, Undo, the Executive Summary panel.
- Small screens: below ~1100px the right card stacks above the text as today.

## Notes
No notes update: this is a UI change to [[Validation Fix Workflow]], one line
there once it's done.
