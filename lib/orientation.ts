/**
 * Portrait or landscape: which way the annual report's pages print.
 *
 * A report holds TWO sets of page picks, one per orientation, side by side on
 * every design unit (`template_key` and `landscape_template_key`). Switching
 * orientation never overwrites the other set, so flipping back finds exactly
 * what was there. These helpers are the one place that decides which of the
 * two a screen reads, so no component has to know the field names.
 *
 * Landscape has no AI involvement: the art director only ever recommends
 * portrait templates, so a landscape page counts as picked only when a person
 * picked it.
 */
import type { DesignOption, DesignUnit } from "@/lib/api/createDesign"

export type Orientation = "portrait" | "landscape"

/** The one landscape section-page template. */
export const LANDSCAPE_TEMPLATE_KEY = "landscape_columns"

/**
 * The one landscape cover, contents and section-opener design.
 *
 * One key for all three because there is nothing to choose between: a
 * landscape report always prints these, so the pickers show it as "in use".
 */
export const LANDSCAPE_DESIGN_KEY = "landscape"

/** The two pick fields of a design page — all these helpers read from a unit. */
export type UnitPicks = Pick<DesignUnit, "template_key" | "landscape_template_key">

/** A section as far as counting picks is concerned: its pages, if extracted. */
export interface SectionPicks {
  design: { units: readonly UnitPicks[] } | null
}

/**
 * The report's orientation, from its saved design record.
 *
 * Anything other than "landscape" reads as portrait — including a missing
 * key, which is what every report saved before landscape existed carries, and
 * what an older backend still returns.
 *
 * @returns "landscape" only when the record says so, else "portrait"
 */
export function orientationOf(
  design?: { orientation?: string | null } | null,
): Orientation {
  if (design?.orientation === "landscape") return "landscape"
  return "portrait"
}

/**
 * The template a person picked for this page in one orientation.
 *
 * @returns the portrait or landscape pick, or null when nothing is picked
 */
export function pickedKey(unit: UnitPicks, orientation: Orientation): string | null {
  if (orientation === "landscape") return unit.landscape_template_key ?? null
  return unit.template_key ?? null
}

/**
 * How many pages have a pick in one orientation, out of how many pages.
 *
 * Counts every page of every section that has a design, the same way the
 * backend counts `units_chosen` / `units_total` — so in portrait the two
 * numbers agree with the header counter the screen already shows.
 *
 * @returns `picked` pages with a template, out of `total` pages
 */
export function countPicked(
  sections: readonly SectionPicks[],
  orientation: Orientation,
): { picked: number; total: number } {
  let picked = 0
  let total = 0
  for (const section of sections) {
    for (const unit of section.design?.units ?? []) {
      total += 1
      if (pickedKey(unit, orientation)) picked += 1
    }
  }
  return { picked, total }
}

// Nominal A4 in points. The engine's real sheet is a hair larger (Chromium
// prints 595.92 x 842.88), but these are used only for preview aspect ratios,
// and both give the same ratio to three decimal places.
const A4_WIDTH_PT = 595.28
const A4_HEIGHT_PT = 841.89

/**
 * The size of one printed page, for drawing previews the right shape.
 *
 * @returns width and height in points; landscape is portrait turned sideways
 */
export function pageSize(orientation: Orientation): { width: number; height: number } {
  if (orientation === "landscape") {
    return { width: A4_HEIGHT_PT, height: A4_WIDTH_PT }
  }
  return { width: A4_WIDTH_PT, height: A4_HEIGHT_PT }
}

/**
 * The template cards a page offers in landscape: just the one.
 *
 * Shaped like the portrait fallback cards on the Create Design screen. Never
 * marked recommended and carries no counts, because the art director never
 * looked at it — in landscape the person picks.
 *
 * @returns a single option for the landscape section-page template
 */
export function landscapeOptions(): DesignOption[] {
  return [
    {
      key: LANDSCAPE_TEMPLATE_KEY,
      recommended: false,
      reason: null,
      counts: {},
      dropped: {},
    },
  ]
}
