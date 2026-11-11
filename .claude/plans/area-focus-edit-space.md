# Areas of Focus: room to edit on step 3

## Problem (2026-10-29)
On Spark's kickoff step 3 (`/pm/cycles/{id}/kickoff/concept`) the page is locked to the window height and only the
areas list scrolls. When the client has sent it back and the PM has edited since, these all sit above the list:
- the header;
- the yellow "You've changed this since they sent it" notice (two lines, big padding);
- the stepper;
- the green "Your client sent this back" bar.

The list is left with about 70–80px, so editing an area name or concept message happens in a slot one line tall.

Mockup (today vs suggested): https://claude.ai/artifact/QPHAs1Uher3TgdQcRxqg6T

## Fix
1. **Minimum height for step 3** (`components/pm/kickoff-direction-screen.tsx`). The fit-to-window wrapper keeps
   `h-[calc(100dvh-136px)]` and gains `min-h-[50rem]`. On a tall window nothing changes. On a short one, the screen
   stays 50rem tall so the list keeps a usable height, and the page scrolls instead (the footer is `sticky`, so it
   stays at the bottom).
2. **Compact drift notice** (`components/pm/ClientDriftNotice.tsx`). New optional `compact` prop: one line, small
   padding, same look as the compact `GateBanner`. Step 3 passes `compact={fitScreen}`. The approve dialog in
   `ShareWithClientButton.tsx` doesn't pass it, so it stays the same.
3. **Edit scrolls the card into view** (`components/report/AreaConceptCard.tsx`). Clicking Edit opens the fields,
   then scrolls the card with `scrollIntoView({ block: "nearest" })`, so the title and text boxes are fully visible.

Not changed: other steps, non-Spark roles, the client's share link (`app/share/[token]/page.tsx`).
No backend, DB or endpoint change, so no Postman update.

## Branch
Frontend `pre-staging` (the user's choice, 2026-10-29).

## Check
- `npx tsc --noEmit` and lint on the changed files.
- User checks in the browser on a short and a tall window.

## Notes
Update `notes/Features/Reporting Cycles and Setup.md`, `notes/Current Status.md`.
