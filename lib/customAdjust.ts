/**
 * Adjusting a finished custom template, page by page: what the Adjust screen
 * sends, and what its result shows.
 *
 * Two numberings meet here. The PM sees SHEETS: the preview's pictures, where
 * sheet 1 is usually the section's title page (the report's section opener,
 * not part of the template). The template has PAGES: page 1 is the first page
 * after the title page. The Adjust screen keeps each note under its template
 * page, so the title page simply has none; the result names notes by sheet
 * again, as the PM saw them.
 *
 * Pure, with type-only imports, so `node` can run its test
 * (lib/customAdjust.test.ts).
 */

import type { CustomAdjustment, CustomTemplate } from "@/lib/api/createDesign"

/** The longest note one page takes; the backend refuses longer ones. */
export const MAX_ADJUST_NOTE_CHARS = 500

/** All notes of one adjustment together; the backend refuses more. */
export const MAX_ADJUST_NOTES_CHARS = 2000

/** The most whole-template notes ("Try again" wishes) one adjustment takes. */
export const MAX_TEMPLATE_NOTES = 5

/** The template page a preview sheet shows (both from 1), or null for the title page. */
export function templatePage(sheet: number, titlePage: boolean): number | null {
  if (!titlePage) return sheet
  return sheet === 1 ? null : sheet - 1
}

/** The preview sheet a template page is drawn on (both from 1). */
export function sheetOf(page: number, titlePage: boolean): number {
  return titlePage ? page + 1 : page
}

/** The page notes as the adjust call sends them: trimmed, empty ones left out. */
export function adjustPayload(pageNotes: Record<number, string>): Record<number, string> {
  const pages: Record<number, string> = {}
  for (const [page, text] of Object.entries(pageNotes)) {
    const note = text.trim()
    if (note) pages[Number(page)] = note
  }
  return pages
}

/** How many notes an adjustment would send (page notes and whole-template notes). */
export function countAdjustNotes(pageNotes: Record<number, string>, templateNotes: string[]): number {
  return Object.keys(adjustPayload(pageNotes)).length + templateNotes.length
}

/** Whether the notes are too long for the backend (any one, or all together). */
export function adjustNotesTooLong(pageNotes: Record<number, string>, templateNotes: string[]): boolean {
  const texts = [...Object.values(adjustPayload(pageNotes)), ...templateNotes]
  if (texts.some((text) => text.length > MAX_ADJUST_NOTE_CHARS)) return true
  return texts.reduce((total, text) => total + text.length, 0) > MAX_ADJUST_NOTES_CHARS
}

/**
 * A wish the template couldn't fully do, as a whole-template note for "Try
 * again". Cut to the note limit: the backend still clears the wish when the
 * note is the start of its line.
 */
export function retryNote(line: string): string {
  return line.trim().slice(0, MAX_ADJUST_NOTE_CHARS)
}

/** The pages the notes are on, as preview sheets, in order ("Notes on sheets 3 and 5"). */
export function notedSheets(pageNotes: Record<number, string>, titlePage: boolean): number[] {
  return Object.keys(adjustPayload(pageNotes))
    .map((page) => sheetOf(Number(page), titlePage))
    .sort((a, b) => a - b)
}

/** One line of the result: where the note was, what was asked, and how it went. */
export interface AdjustResultLine {
  /** The template page the note was on, or null for a whole-template note. */
  page: number | null
  /** "Sheet 5", or "Whole template". */
  where: string
  note: string
  /** The designer's answer, or the reviewer's evidence when there is no answer. */
  says: string
  state: "done" | "not_quite" | "unchecked"
}

/** The result's lines, one per note, named by the sheet the PM wrote it on. */
export function adjustResultLines(adjustment: CustomAdjustment): AdjustResultLine[] {
  return adjustment.notes.map((item) => ({
    page: item.page,
    where: item.page === null ? "Whole template" : `Sheet ${sheetOf(item.page, adjustment.title_page)}`,
    note: item.note,
    says: item.answer || item.evidence,
    state: item.done === null ? "unchecked" : item.done ? "done" : "not_quite",
  }))
}

/** "All 2 changes done", "1 of 2 changes done", or "Changes made, not checked". */
export function adjustResultSummary(adjustment: CustomAdjustment): string {
  const total = adjustment.notes.length
  const checked = adjustment.notes.filter((item) => item.done !== null)
  const done = checked.filter((item) => item.done).length
  if (checked.length === 0) return "Changes made, not checked"
  if (done === total) return total === 1 ? "The change is done" : `All ${total} changes done`
  return `${done} of ${total} changes done`
}

/**
 * Whether the screen already has the version an adjustment made: the one in
 * use or a kept one. When it has not, the screen's data is older than the
 * server's, and should be read again.
 */
export function hasAdjustmentResult(versions: CustomTemplate[], at: string): boolean {
  return versions.some((version) => version.adjustment?.at === at)
}

/** How a kept version was made, for the versions list. */
export function versionLabel(version: CustomTemplate): string {
  if (version.adjustment) {
    const count = version.adjustment.notes.length
    return count === 1 ? "Adjusted (1 note)" : `Adjusted (${count} notes)`
  }
  if (version.sketch_version) return `Built from sketch ${version.sketch_version}`
  return "Designed from your request"
}
