/**
 * What the browser tab remembers about a layout sketch: the run the screen is
 * waiting for, and notes typed but not sent yet.
 *
 * sessionStorage, not React state: the custom template panel remounts with
 * empty state whenever it closes (Preview and back, a rail click, a card
 * click), and a PM's notes or a running sketch must survive that. Every read
 * and write is wrapped, so the panel works the same when storage is blocked —
 * it simply forgets on close.
 *
 * The parsing lives in lib/customSketch.ts, where it can be tested.
 */

import type { CustomPaper } from "@/lib/api/createDesign"
import { EMPTY_DRAFT, draftKey, parseDraft, serialiseDraft, type SketchDraft } from "@/lib/customSketch"

/** The tab's draft for one section on one sheet (the empty draft when there is none). */
export function readSketchDraft(cycleId: string, sectionCode: string, paper: CustomPaper): SketchDraft {
  try {
    return parseDraft(window.sessionStorage.getItem(draftKey(cycleId, sectionCode, paper)))
  } catch {
    return EMPTY_DRAFT
  }
}

/** Store the draft; an empty draft removes the entry. */
export function writeSketchDraft(
  cycleId: string,
  sectionCode: string,
  paper: CustomPaper,
  draft: SketchDraft,
): void {
  try {
    const key = draftKey(cycleId, sectionCode, paper)
    if (!draft.pending && !draft.notes) {
      window.sessionStorage.removeItem(key)
    } else {
      window.sessionStorage.setItem(key, serialiseDraft(draft))
    }
  } catch {
    // Storage blocked or full: the panel still works, it just forgets on close.
  }
}
