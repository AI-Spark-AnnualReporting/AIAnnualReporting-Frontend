/**
 * Layout sketches for custom templates: the quick first step a PM adjusts with
 * notes, layout by layout, before a custom template is built from it.
 *
 * A sketch is a few page LAYOUTS (an opening page, 1–3 body layouts used in
 * turn, an end page for the tables), each a short list of boxes positioned in
 * % of the page. Feedback is per layout, not per printed page, because pages
 * are built from layouts that repeat and the page count moves with the text.
 *
 * Pure, with type-only imports, so `node` can run its test directly
 * (lib/customSketch.test.ts).
 */

import type {
  CustomPaper, CustomSketch, CustomSketchRecord, DesignUnit, SketchBox, SketchLayout, SketchNotes,
  SketchVersion,
} from "@/lib/api/createDesign"

/** The longest note a layout box takes; the backend refuses longer ones. */
export const MAX_NOTE_CHARS = 500

/** All notes of one update together; the backend refuses more. */
export const MAX_NOTES_CHARS = 2000

/**
 * About this many square points of a text box hold one character of body text
 * (≈ 10pt type on 14.5pt lines). A full portrait safe area then holds ~4,400
 * characters, the engine's own "about 4,500 characters per page".
 */
const PT2_PER_CHARACTER = 80

/** Never estimate more pages than this, whatever the sketch. */
const MAX_ESTIMATED_PAGES = 60

// --------------------------------------------------------------------------
// finding things in a record
// --------------------------------------------------------------------------

/** The unit field holding the sketch for this sheet (16:9 shares landscape's). */
export function sketchField(paper: CustomPaper): "custom_sketch" | "landscape_custom_sketch" {
  return paper === "portrait" ? "custom_sketch" : "landscape_custom_sketch"
}

/** The unit's sketch record for this sheet, or null (none, or made for the other sheet). */
export function sketchRecordFor(
  unit: Pick<DesignUnit, "custom_sketch" | "landscape_custom_sketch"> | null,
  paper: CustomPaper,
): CustomSketchRecord | null {
  if (!unit) return null
  const record = unit[sketchField(paper)]
  if (!record || record.paper !== paper) return null
  return record
}

/** The newest version (the highest number), or null. */
export function latestVersion(record: CustomSketchRecord | null): SketchVersion | null {
  let latest: SketchVersion | null = null
  for (const version of record?.versions ?? []) {
    if (!latest || version.version > latest.version) latest = version
  }
  return latest
}

/** The version with this number, or null. */
export function versionByNumber(
  record: CustomSketchRecord | null,
  number: number,
): SketchVersion | null {
  return record?.versions.find((version) => version.version === number) ?? null
}

/** The version a run with this ticket made, or null. */
export function versionByTicket(
  record: CustomSketchRecord | null,
  runId: string,
): SketchVersion | null {
  if (!runId) return null
  return record?.versions.find((version) => version.run_id === runId) ?? null
}

/** "Opening page", "Layout A", "End page". */
export function layoutName(layoutId: string): string {
  if (layoutId === "opener") return "Opening page"
  if (layoutId === "end") return "End page"
  return `Layout ${layoutId}`
}

/** The short label in the page-order strip: "Opening", "A", "End". */
export function layoutTag(layoutId: string): string {
  if (layoutId === "opener") return "Opening"
  if (layoutId === "end") return "End"
  return layoutId
}

// --------------------------------------------------------------------------
// how many pages, and which layout each one uses (an estimate)
// --------------------------------------------------------------------------

/** What the section prints, as the page estimate needs it. */
export interface SketchContent {
  /** Characters of body text (subheadings left out). */
  proseCharacters: number
  figures: number
  quotes: number
  tables: number
}

/** The estimated page order of a sketch. */
export interface PagePlan {
  /** The layout id of every designed page, in order (the end page not included). */
  order: string[]
  /** Layout id → the page numbers it is used on (from 1). */
  pages: Record<string, number[]>
  /** Whether an end page follows: tables, or figures/quotes the spots can't hold. */
  endPage: boolean
}

/** Characters of text a layout's text boxes hold, roughly. */
export function textRoom(layout: SketchLayout, pagePt: [number, number]): number {
  const [width, height] = pagePt
  let area = 0
  for (const box of layout.boxes) {
    if (box.role !== "text") continue
    area += (box.w / 100) * width * ((box.h / 100) * height)
  }
  return area / PT2_PER_CHARACTER
}

/** How many figures (or quotes) a layout's spots hold. */
function spotRoom(layout: SketchLayout, role: "figures" | "quotes"): number {
  let room = 0
  for (const box of layout.boxes) {
    if (box.role === role) room += box.holds
  }
  return room
}

/**
 * Which layout each page uses, the way the engine deals the text: the opening
 * page once, then the body layouts in turn while text is left. A body layout
 * without a text box still takes its turn (the engine prints it as a picture
 * or figures page). Always at least one designed page.
 */
export function estimateLayoutPages(
  sketch: CustomSketch,
  pagePt: [number, number],
  content: SketchContent,
): PagePlan {
  const opener = sketch.layouts.find((layout) => layout.kind === "opener") ?? null
  const bodies = sketch.layouts.filter((layout) => layout.kind === "body")
  const order: string[] = []
  let textLeft = content.proseCharacters

  if (opener) {
    order.push(opener.id)
    textLeft -= textRoom(opener, pagePt)
  }
  // Body layouts that hold no text would never use the text up: show each
  // once rather than a strip of sixty pages.
  const bodiesHoldText = bodies.some((body) => textRoom(body, pagePt) > 0)
  let turn = 0
  while (bodies.length > 0 && order.length < MAX_ESTIMATED_PAGES && (textLeft > 0 || order.length === 0)) {
    if (!bodiesHoldText && turn >= bodies.length) break
    const body = bodies[turn % bodies.length]
    order.push(body.id)
    textLeft -= textRoom(body, pagePt)
    turn += 1
  }

  const pages: Record<string, number[]> = {}
  let figureRoom = 0
  let quoteRoom = 0
  order.forEach((layoutId, index) => {
    const layout = sketch.layouts.find((candidate) => candidate.id === layoutId)
    if (!layout) return
    pages[layoutId] = [...(pages[layoutId] ?? []), index + 1]
    figureRoom += spotRoom(layout, "figures")
    quoteRoom += spotRoom(layout, "quotes")
  })
  const endPage = content.tables > 0 || content.figures > figureRoom || content.quotes > quoteRoom
  return { order, pages, endPage }
}

/** "pages 2, 4 and 6", "page 1", "not used for this text" — for a layout's heading. */
export function pagesText(pageNumbers: number[]): string {
  if (pageNumbers.length === 0) return "not used: the text ends before it"
  if (pageNumbers.length === 1) return `page ${pageNumbers[0]}`
  const shown = pageNumbers.slice(0, 6)
  const more = pageNumbers.length > shown.length ? ` and ${pageNumbers.length - shown.length} more` : ""
  if (more) return `pages ${shown.join(", ")}${more}`
  return `pages ${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`
}

// --------------------------------------------------------------------------
// drawing
// --------------------------------------------------------------------------

/**
 * The CSS that cuts a box into its shape. clip-path polygons are physical, so
 * the one shape that leans (slanted) is flipped for a right-to-left report;
 * the others are symmetric.
 */
export function shapeStyle(
  shape: SketchBox["shape"],
  rtl: boolean,
): { clipPath?: string; borderRadius?: string } {
  switch (shape) {
    case "rounded":
      return { borderRadius: "10px" }
    case "circle":
      return { clipPath: "circle(closest-side at 50% 50%)" }
    case "diamond":
      return { clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)" }
    case "triangle":
      return { clipPath: "polygon(50% 0, 100% 100%, 0 100%)" }
    case "arch":
      return { borderRadius: "9999px 9999px 0 0" }
    case "hexagon":
      return { clipPath: "polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)" }
    case "slanted":
      return {
        clipPath: rtl
          ? "polygon(0 0, 82% 0, 100% 100%, 18% 100%)"
          : "polygon(18% 0, 100% 0, 82% 100%, 0 100%)",
      }
    default:
      return {}
  }
}

/** The small label a box carries in the drawing. */
export function boxLabel(box: SketchBox): string {
  if (box.role === "text") return box.columns > 1 ? `Text · ${box.columns} columns` : "Text"
  if (box.role === "image") return "Image"
  if (box.role === "figures") return box.holds === 1 ? "1 figure" : `Up to ${box.holds} figures`
  if (box.role === "quotes") return box.holds === 1 ? "1 quote" : `Up to ${box.holds} quotes`
  return ""
}

// --------------------------------------------------------------------------
// notes
// --------------------------------------------------------------------------

/** The notes as the update call sends them: trimmed, only for layouts the version has. */
export function notesPayload(
  notes: Record<string, string>,
  allPages: string,
  layoutIds: string[],
): SketchNotes {
  const layouts: Record<string, string> = {}
  for (const layoutId of layoutIds) {
    const text = (notes[layoutId] ?? "").trim()
    if (text) layouts[layoutId] = text
  }
  return { layouts, all_pages: allPages.trim() }
}

/** How many notes a payload carries (the "All pages" note counts as one). */
export function countNotes(payload: SketchNotes): number {
  return Object.keys(payload.layouts).length + (payload.all_pages ? 1 : 0)
}

/** Whether a payload is too long for the backend (any note, or all of them together). */
export function notesTooLong(payload: SketchNotes): boolean {
  const texts = [...Object.values(payload.layouts), payload.all_pages].filter(Boolean)
  if (texts.some((text) => text.length > MAX_NOTE_CHARS)) return true
  return texts.reduce((total, text) => total + text.length, 0) > MAX_NOTES_CHARS
}

// --------------------------------------------------------------------------
// what the browser tab remembers (lib/customSketchDrafts.ts stores it)
// --------------------------------------------------------------------------

/**
 * A sketch run the screen is waiting for, and notes not sent yet. Kept in the
 * tab so closing the panel (Preview and back, a rail or card click) loses
 * neither: the panel remounts with empty state every time.
 */
export interface SketchDraft {
  pending: { runId: string; startedAt: number } | null
  /** Unsent notes, for the version they were written on. */
  notes: { version: number; layouts: Record<string, string>; allPages: string } | null
}

export const EMPTY_DRAFT: SketchDraft = { pending: null, notes: null }

/** The sessionStorage key for one section on one sheet. */
export function draftKey(cycleId: string, sectionCode: string, paper: CustomPaper): string {
  return `custom-sketch:${cycleId}:${sectionCode}:${paper}`
}

/** A stored draft, or the empty draft when the text is missing or not a draft. */
export function parseDraft(text: string | null): SketchDraft {
  if (!text) return EMPTY_DRAFT
  try {
    const value = JSON.parse(text)
    const pending =
      value?.pending && typeof value.pending.runId === "string" && typeof value.pending.startedAt === "number"
        ? { runId: value.pending.runId as string, startedAt: value.pending.startedAt as number }
        : null
    const notes =
      value?.notes && typeof value.notes.version === "number" && typeof value.notes.layouts === "object"
        ? {
            version: value.notes.version as number,
            layouts: stringsOnly(value.notes.layouts),
            allPages: typeof value.notes.allPages === "string" ? value.notes.allPages : "",
          }
        : null
    return { pending, notes }
  } catch {
    return EMPTY_DRAFT
  }
}

/** Only the string values of an object (notes that survived a round trip). */
function stringsOnly(value: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!value || typeof value !== "object") return out
  for (const [key, text] of Object.entries(value as Record<string, unknown>)) {
    if (typeof text === "string") out[key] = text
  }
  return out
}

/** A draft as stored text. */
export function serialiseDraft(draft: SketchDraft): string {
  return JSON.stringify(draft)
}
