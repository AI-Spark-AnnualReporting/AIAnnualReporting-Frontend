/**
 * Turn a template's "dropped" report into one line a person can act on.
 *
 * The engine tells us exactly how many items each template would leave out.
 * Saying "47 figures → 8 shown" is the difference between a PM choosing a
 * layout knowingly and discovering the loss in the printed report.
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
  if (n(p.para)) parts.push(plural(n(p.para), "paragraph", "paragraphs"))
  if (n(p.lede)) parts.push(plural(n(p.lede), "intro line", "intro lines"))
  return parts.join(" · ")
}
