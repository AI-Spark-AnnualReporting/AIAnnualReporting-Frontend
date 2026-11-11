# Hide the "Web" button on the Final Report page

**Date:** 2026-11-02 · **Repo:** AIAnnualReporting-Frontend only · **Branch:** pre-staging (current)

## Goal
The PM should no longer see the "Web" button (globe icon) in the Final Report header, next to Create Design and Validate report.

## Steps
1. `app/(protected)/pm/cycles/[id]/report/page.tsx`
   - Delete the `<Link href=".../web">…Web…</Link>` block and its comment (about lines 270-278).
   - Remove `Globe` from the lucide-react import (line 23). It is used nowhere else in this file, and leaving it unused would fail lint.
2. Run `npx tsc --noEmit -p tsconfig.json` and lint on that file to make sure nothing else broke.
3. Notes: add a line to the [[Web microsite]] note and Current Status saying the button is hidden.

## What is NOT changed
- The `/pm/cycles/[id]/web` page, its code and the backend sitemap endpoints all stay. Typing the URL directly still opens the page.
- Nothing else links to `/web`. A grep found only this one button.

## Ripple effect
- Only the report page header changes, and the other buttons simply close the gap.
- Undoing it later means adding the same block back.
