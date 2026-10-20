/**
 * Self-check for the layout sketch helpers. No framework — run it with:
 *   node lib/customSketch.test.ts
 *
 * Pinned: a sketch made for one sheet is never shown on another; the page
 * order follows the engine (the opening page once, then the body layouts in
 * turn while text is left, an end page when tables or extra figures need one);
 * the slanted shape mirrors in Arabic; notes are sent trimmed and only for
 * layouts the version has; a stored draft that is broken reads as empty.
 */

import assert from "node:assert/strict"
import type { CustomSketch, CustomSketchRecord, SketchBox, SketchVersion } from "./api/createDesign.ts"
import {
  EMPTY_DRAFT,
  countNotes,
  draftKey,
  estimateLayoutPages,
  latestVersion,
  layoutName,
  notesPayload,
  notesTooLong,
  pagesText,
  parseDraft,
  serialiseDraft,
  shapeStyle,
  sketchRecordFor,
  textRoom,
  versionByNumber,
  versionByTicket,
} from "./customSketch.ts"

const PORTRAIT: [number, number] = [595.92, 842.88]

function box(role: SketchBox["role"], x: number, y: number, w: number, h: number, extra: Partial<SketchBox> = {}): SketchBox {
  return { role, shape: "rectangle", colour: "none", x, y, w, h, columns: 1, holds: 0, ...extra }
}

/** Opening page (some text), A (lots of text + 2 figures), B (no text: a picture page), end. */
const SKETCH: CustomSketch = {
  concept: "Bold bands",
  cannot_do: [],
  layouts: [
    { id: "opener", kind: "opener", summary: "", boxes: [box("image", 0, 10, 100, 40), box("text", 10, 55, 80, 35)] },
    { id: "A", kind: "body", summary: "", boxes: [box("text", 10, 8, 55, 84), box("figures", 68, 8, 22, 40, { holds: 2 })] },
    { id: "B", kind: "body", summary: "", boxes: [box("image", 0, 8, 100, 84)] },
    { id: "end", kind: "end", summary: "", boxes: [] },
  ],
}

function version(number: number, runId: string): SketchVersion {
  return { version: number, run_id: runId, request: "", sketch: SKETCH, notes: null, based_on: null, replies: [], created_at: "" }
}

function record(paper: CustomSketchRecord["paper"], versions: SketchVersion[]): CustomSketchRecord {
  return { paper, language: "english", page_pt: PORTRAIT, safe_inset_pt: 56.7, colours: { brand: "#000000", second: "#111111", light: "#EEEEEE" }, versions }
}

// --- records -----------------------------------------------------------------

{
  const landscape = record("landscape", [version(1, "t1")])
  const unit = { custom_sketch: record("portrait", [version(3, "a"), version(5, "b"), version(4, "c")]), landscape_custom_sketch: landscape }
  assert.equal(sketchRecordFor(unit, "portrait")?.paper, "portrait")
  assert.equal(sketchRecordFor(unit, "landscape"), landscape)
  // A record made on A4 landscape is not this 16:9 sheet's sketch.
  assert.equal(sketchRecordFor(unit, "presentation"), null)
  assert.equal(sketchRecordFor(null, "portrait"), null)
  const portrait = sketchRecordFor(unit, "portrait")
  assert.equal(latestVersion(portrait)?.version, 5)
  assert.equal(latestVersion(null), null)
  assert.equal(versionByNumber(portrait, 4)?.run_id, "c")
  assert.equal(versionByTicket(portrait, "b")?.version, 5)
  assert.equal(versionByTicket(portrait, ""), null)
  assert.equal(layoutName("opener"), "Opening page")
  assert.equal(layoutName("B"), "Layout B")
  assert.equal(layoutName("end"), "End page")
}

// --- the page order ----------------------------------------------------------

{
  const opener = SKETCH.layouts[0]
  const roomA = textRoom(SKETCH.layouts[1], PORTRAIT)
  assert.ok(textRoom(SKETCH.layouts[2], PORTRAIT) === 0, "a picture layout holds no text")
  // ~4,400 characters on a full portrait safe area, as the engine estimates.
  const fullPage = textRoom({ id: "A", kind: "body", summary: "", boxes: [box("text", 9.51, 6.73, 80.98, 86.54)] }, PORTRAIT)
  assert.ok(fullPage > 4000 && fullPage < 4800, `full page holds ${fullPage}`)

  // Short text: the opening page alone.
  const short = estimateLayoutPages(SKETCH, PORTRAIT, { proseCharacters: 500, figures: 0, quotes: 0, tables: 0 })
  assert.deepEqual(short.order, ["opener"])
  assert.equal(short.endPage, false)

  // Long text: opening once, then A and B in turn while text is left; B holds
  // none, but still takes its turn.
  const longText = textRoom(opener, PORTRAIT) + roomA * 2 + 10
  const long = estimateLayoutPages(SKETCH, PORTRAIT, { proseCharacters: longText, figures: 0, quotes: 0, tables: 0 })
  assert.deepEqual(long.order, ["opener", "A", "B", "A", "B", "A"])
  assert.deepEqual(long.pages, { opener: [1], A: [2, 4, 6], B: [3, 5] })

  // No text at all still gives one designed page; tables bring the end page.
  const bodyOnly: CustomSketch = { ...SKETCH, layouts: SKETCH.layouts.filter((layout) => layout.kind !== "opener") }
  const empty = estimateLayoutPages(bodyOnly, PORTRAIT, { proseCharacters: 0, figures: 0, quotes: 0, tables: 1 })
  assert.deepEqual(empty.order, ["A"])
  assert.equal(empty.endPage, true)

  // More figures than the spots hold need the end page; fewer don't.
  const twoPages = estimateLayoutPages(SKETCH, PORTRAIT, { proseCharacters: textRoom(opener, PORTRAIT) + 10, figures: 2, quotes: 0, tables: 0 })
  assert.deepEqual(twoPages.order, ["opener", "A"])
  assert.equal(twoPages.endPage, false)
  assert.equal(estimateLayoutPages(SKETCH, PORTRAIT, { proseCharacters: textRoom(opener, PORTRAIT) + 10, figures: 3, quotes: 0, tables: 0 }).endPage, true)

  // A sketch whose bodies hold no text shows each body once instead of looping.
  const noText: CustomSketch = { ...SKETCH, layouts: [SKETCH.layouts[2], SKETCH.layouts[3]] }
  assert.deepEqual(estimateLayoutPages(noText, PORTRAIT, { proseCharacters: 99999, figures: 0, quotes: 0, tables: 0 }).order, ["B"])

  assert.equal(pagesText([1]), "page 1")
  assert.equal(pagesText([2, 4, 6]), "pages 2, 4 and 6")
  assert.equal(pagesText([2, 4, 6, 8, 10, 12, 14, 16]), "pages 2, 4, 6, 8, 10, 12 and 2 more")
  assert.equal(pagesText([]), "not used: the text ends before it")
}

// --- shapes ------------------------------------------------------------------

{
  assert.deepEqual(shapeStyle("rectangle", false), {})
  assert.ok(shapeStyle("circle", false).clipPath?.startsWith("circle("))
  assert.ok(shapeStyle("arch", false).borderRadius)
  assert.notEqual(shapeStyle("slanted", false).clipPath, shapeStyle("slanted", true).clipPath)
  for (const shape of ["circle", "diamond", "triangle", "hexagon"] as const) {
    assert.deepEqual(shapeStyle(shape, true), shapeStyle(shape, false), `${shape} is symmetric`)
  }
}

// --- notes -------------------------------------------------------------------

{
  const payload = notesPayload({ A: "  bigger  ", B: "  ", Z: "not a layout" }, " rectangles ", ["opener", "A", "B", "end"])
  assert.deepEqual(payload, { layouts: { A: "bigger" }, all_pages: "rectangles" })
  assert.equal(countNotes(payload), 2)
  assert.equal(countNotes(notesPayload({}, "  ", ["A"])), 0)
  assert.equal(notesTooLong(payload), false)
  assert.equal(notesTooLong({ layouts: { A: "x".repeat(501) }, all_pages: "" }), true)
  assert.equal(notesTooLong({ layouts: { A: "x".repeat(450), B: "x".repeat(450), C: "x".repeat(450), end: "x".repeat(450) }, all_pages: "x".repeat(450) }), true)
}

// --- drafts ------------------------------------------------------------------

{
  assert.equal(draftKey("c1", "ceo", "portrait"), "custom-sketch:c1:ceo:portrait")
  const draft = { pending: { runId: "t1", startedAt: 123 }, notes: { version: 2, layouts: { A: "bigger" }, allPages: "x" } }
  assert.deepEqual(parseDraft(serialiseDraft(draft)), draft)
  assert.deepEqual(parseDraft(null), EMPTY_DRAFT)
  assert.deepEqual(parseDraft("{not json"), EMPTY_DRAFT)
  assert.deepEqual(parseDraft(JSON.stringify({ pending: { runId: 5 }, notes: { version: "2" } })), EMPTY_DRAFT)
  assert.deepEqual(parseDraft(JSON.stringify({ notes: { version: 1, layouts: { A: "ok", B: 7 } } })).notes, { version: 1, layouts: { A: "ok" }, allPages: "" })
}

console.log("customSketch: all checks passed")
