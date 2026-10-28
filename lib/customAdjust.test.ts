/**
 * Self-check for the Adjust helpers. No framework — run it with:
 *   node lib/customAdjust.test.ts
 *
 * Pinned: a preview sheet maps to the right template page (the title page,
 * when the preview shows one, is no page at all); empty notes are left out;
 * the result names each note by the sheet the PM saw.
 */

import assert from "node:assert/strict"
import type { CustomAdjustment, CustomTemplate } from "./api/createDesign.ts"
import {
  adjustNotesTooLong,
  adjustPayload,
  adjustResultLines,
  adjustResultSummary,
  countAdjustNotes,
  hasAdjustmentResult,
  notedSheets,
  retryNote,
  sheetOf,
  templatePage,
  versionLabel,
} from "./customAdjust.ts"

// --- sheets and pages ----------------------------------------------------------

assert.equal(templatePage(1, true), null, "the title page is not a template page")
assert.equal(templatePage(5, true), 4)
assert.equal(templatePage(1, false), 1)
assert.equal(sheetOf(4, true), 5)
assert.equal(sheetOf(4, false), 4)
for (const titlePage of [true, false]) {
  for (let page = 1; page <= 8; page++) {
    assert.equal(templatePage(sheetOf(page, titlePage), titlePage), page)
  }
}

// --- the payload -----------------------------------------------------------------

assert.deepEqual(adjustPayload({ 2: "  bigger  ", 4: "   ", 5: "square" }), { 2: "bigger", 5: "square" })
assert.deepEqual(adjustPayload({}), {})
assert.equal(countAdjustNotes({ 3: "a", 4: " " }, ["again"]), 2)
assert.equal(countAdjustNotes({}, []), 0)
assert.equal(adjustNotesTooLong({ 2: "x".repeat(500) }, []), false)
assert.equal(adjustNotesTooLong({ 2: "x".repeat(501) }, []), true)
assert.equal(adjustNotesTooLong({ 2: `  ${"x".repeat(500)}  ` }, []), false, "spaces round a note don't count")
assert.equal(adjustNotesTooLong({ 2: "x".repeat(450), 3: "x".repeat(450), 4: "x".repeat(450), 5: "x".repeat(450) }, ["x".repeat(450)]), true)
assert.deepEqual(notedSheets({ 4: "b", 2: "a", 3: " " }, true), [3, 5])
assert.deepEqual(notedSheets({ 4: "b", 2: "a" }, false), [2, 4])
assert.equal(retryNote("  a wish — why  "), "a wish — why")
assert.equal(retryNote("w".repeat(700)).length, 500)

// --- the result ------------------------------------------------------------------

const adjustment: CustomAdjustment = {
  at: "t1",
  title_page: true,
  notes: [
    { number: 1, page: 4, note: "square picture", answer: "Done: the picture is square.", done: true, evidence: "square" },
    { number: 2, page: 6, note: "smaller figures", answer: "", done: false, evidence: "still large" },
    { number: 3, page: null, note: "an image on every page", answer: "Added image areas.", done: null, evidence: "" },
  ],
}
assert.deepEqual(adjustResultLines(adjustment), [
  { page: 4, where: "Sheet 5", note: "square picture", says: "Done: the picture is square.", state: "done" },
  { page: 6, where: "Sheet 7", note: "smaller figures", says: "still large", state: "not_quite" },
  { page: null, where: "Whole template", note: "an image on every page", says: "Added image areas.", state: "unchecked" },
])
assert.equal(adjustResultLines({ ...adjustment, title_page: false })[0].where, "Sheet 4")
assert.equal(adjustResultSummary(adjustment), "1 of 3 changes done")
assert.equal(adjustResultSummary({ ...adjustment, notes: [adjustment.notes[0]] }), "The change is done")
assert.equal(adjustResultSummary({ ...adjustment, notes: [adjustment.notes[0], adjustment.notes[0]] }), "All 2 changes done")
assert.equal(adjustResultSummary({ ...adjustment, notes: [adjustment.notes[2]] }), "Changes made, not checked")

// --- versions --------------------------------------------------------------------

const version = (extra: Partial<CustomTemplate>): CustomTemplate => ({
  html: "", css: "", notes: "", paper: "portrait", brief: {}, instructions: "", model: "",
  rounds: 1, needs_recheck: false, created_at: "c", ...extra,
})
assert.equal(hasAdjustmentResult([version({}), version({ adjustment })], "t1"), true)
assert.equal(hasAdjustmentResult([version({})], "t1"), false, "a result the screen doesn't have yet")
assert.equal(versionLabel(version({ adjustment })), "Adjusted (3 notes)")
assert.equal(versionLabel(version({ sketch_version: 2 })), "Built from sketch 2")
assert.equal(versionLabel(version({})), "Designed from your request")

console.log("customAdjust: all checks passed")
