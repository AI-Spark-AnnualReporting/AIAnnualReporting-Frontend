/**
 * What a template placed, and — if it ever comes to it — what it lost.
 *
 * Loss used to be a NORMAL state here: each template had slots for only some
 * content types, so choosing narrative_text_heavy silently discarded every
 * figure and table in the section and this file's job was to phrase the
 * damage. Every template now holds every content type, so `dropped` is zero
 * by construction and a non-zero value is a BUG rather than a layout
 * trade-off. lossText survives to make that regression loud; placedText is
 * what a person should normally be reading.
 *
 * Pure — self-checked with `node lib/design2Loss.test.ts`.
 */

export interface DroppedCounts {
  narrative_blocks?: number
  numeric_data?: number
  tables?: number
  pull_quotes?: number
}

export interface PlacedCounts {
  stat?: number
  para?: number
  table?: number
  lede?: number
  quote?: number
}

const n = (v: unknown): number => (typeof v === "number" && v > 0 ? v : 0)

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`

/**
 * One short clause per kind of loss, at most two, then an ellipsis.
 *
 * Figures get the richest phrasing because they are the loss a PM most often
 * cares about: the total is reconstructed from placed + dropped so the line
 * reads as a ratio rather than an absolute.
 */
export function lossText(
  dropped: DroppedCounts | null | undefined,
  placed?: PlacedCounts | null,
): string {
  const d = dropped ?? {}
  const clauses: string[] = []

  const figures = n(d.numeric_data)
  if (figures) {
    const shown = n(placed?.stat)
    clauses.push(
      shown ? `${shown + figures} figures → ${shown} shown` : `${plural(figures, "figure", "figures")} not shown`,
    )
  }
  if (n(d.tables)) clauses.push(`${plural(n(d.tables), "table", "tables")} not shown`)
  if (n(d.narrative_blocks))
    clauses.push(`${plural(n(d.narrative_blocks), "paragraph", "paragraphs")} not shown`)
  if (n(d.pull_quotes)) clauses.push(`${plural(n(d.pull_quotes), "quote", "quotes")} not shown`)

  if (clauses.length === 0) return ""
  if (clauses.length <= 2) return clauses.join(" · ")
  return `${clauses.slice(0, 2).join(" · ")} …`
}

/** Does this template leave anything out at all? Drives the warning badge. */
export function losesContent(dropped: DroppedCounts | null | undefined): boolean {
  return lossText(dropped) !== ""
}

/** "5 figures · 12 paragraphs" — what a template actually placed. */
export function placedText(placed: PlacedCounts | null | undefined): string {
  const p = placed ?? {}
  const parts: string[] = []
  if (n(p.stat)) parts.push(plural(n(p.stat), "figure", "figures"))
  if (n(p.table)) parts.push(plural(n(p.table), "table", "tables"))
  if (n(p.para) || n(p.lede))
    parts.push(plural(n(p.para) + n(p.lede), "paragraph", "paragraphs"))
  if (n(p.quote)) parts.push(plural(n(p.quote), "quote", "quotes"))
  return parts.join(" · ")
}

/**
 * The line a person normally sees: a positive confirmation that the page
 * carries everything the section supplied.
 *
 * Deliberately says "All", because the one question this screen has to answer
 * at a glance is "is anything missing?" and the honest answer is now always
 * no. An empty section says so plainly rather than reading as a failure.
 */
export function placementText(placed: PlacedCounts | null | undefined): string {
  const text = placedText(placed)
  return text ? `All ${text} placed` : "Nothing to place in this section"
}
