# Report Builder: the whole page scrolls on Extract sections

## Problem (2026-10-26)
On the Report Builder (`/pm/cycles/{id}/build`), clicking an **Extract** section that has an uploaded document
makes the whole browser page scrollable:
- the app slides up;
- a blank white band appears below it;
- the browser's own scrollbar appears and jumps around as you click between sections.

AI-written sections are fine.

## Cause (proven in a mock of the builder layout, headless Chromium)
To make the **Replace** button work, `AttachSection` and `ContentSection` render a hidden file-picker box at the
bottom of the section's content. Two things make that box escape:
- it is positioned absolutely (`sr-only`);
- so is react-dropzone's own hidden `<input>`.

None of their parents is a positioned element, so the browser places these boxes against the **whole page** rather
than the panel. The panel's scroll and clipping no longer contain them. The page's height grows to wherever the box
sits, which is the bottom of a long table or notes text, so it can be thousands of pixels.

- **In the mock:** the page grew from 700px to 3,224px.
- **Focusing the hidden input** (what Replace does) jumped the page 2,524px down.

## Fix
Add `relative` to the scrolling panel (`flex-1 overflow-y-auto` → `relative flex-1 overflow-y-auto`) in:
- `components/report/AttachSection.tsx`, the panel that holds the attached file and the hidden Replace box.
- `components/report/ContentSection.tsx`, the same panel. It is also the drop zone, so its own hidden input escapes too.

The panel then becomes the box the hidden elements are placed against. They stay inside it, scroll with it and are
clipped by it.

**Same mock with the fix:** the page stays at 700px in every variant, and focusing the input moves nothing.

## Impact
- Only these two panels change. A `relative` on them adds no visible change, because nothing inside relies on being
  placed against the page.
- **Checked:** GenerateSection's "Refining…" overlay already sits in a `relative` box, so it is not affected. No
  other builder panel has a hidden input.
- Drag-and-drop upload and the Replace button keep working. The input is still in the DOM; only the box it is
  positioned against changes.

## Verification
- tsc and eslint on the two files.
- You click Notes to the Statements, then the consolidated statement, then Risk Management: no page scrollbar, no
  white band, and the app stays put.
- Click Replace and pick a file: the upload still works.

## Result (2026-10-26)
- Built as planned: `relative` added to the scrolling panel in `AttachSection.tsx` and `ContentSection.tsx`, each
  with a comment saying why.
- tsc and eslint are clean.
- Not committed. Waiting on your click-through in the real app.
