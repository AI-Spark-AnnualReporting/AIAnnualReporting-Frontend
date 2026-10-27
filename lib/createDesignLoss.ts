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
 * Pure — self-checked with `node lib/createDesignLoss.test.ts`.
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

/**
 * The templates that print only the heading and the tables, by design — the
 * same list as TABLES_ONLY_KEYS in the engine's page_filler.py. Unlike every
 * other template, these really do leave content out.
 */
export const TABLES_ONLY_TEMPLATE_KEYS: readonly string[] = [
  "borderless_table",
  "landscape_borderless_table",
  "grid_table",
  "landscape_grid_table",
]

/**
 * Whether a tables-only template is on screen with nothing counted for it.
 *
 * A section's cards are saved when it is extracted, so a section extracted
 * before Borderless table or Grid table existed has no counts or losses for
 * them. Without this, the panel read that silence as "nothing is dropped"
 * while the template leaves out every paragraph, figure and quote.
 *
 * @param templateKey the template being drawn
 * @param option      its card's counts and losses, or null when it has no card
 * @returns true when the template is tables-only and its card counted nothing
 *          (a freshly counted card with losses shows those losses instead)
 */
export function tablesOnlyUncounted(
  templateKey: string | null | undefined,
  option: { counts?: PlacedCounts | null; dropped?: DroppedCounts | null } | null | undefined,
): boolean {
  if (!templateKey || !TABLES_ONLY_TEMPLATE_KEYS.includes(templateKey)) return false
  const counted = Object.keys(option?.counts ?? {}).length > 0
  return !counted && !losesContent(option?.dropped)
}

/** The warning shown for a tables-only template that has not been counted yet. */
export const TABLES_ONLY_UNCOUNTED_TEXT =
  "any text, figures and quotes are not printed. Re-extract this section to count them"
