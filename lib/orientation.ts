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

/**
 * The landscape section-page templates, default first. Mirrors the engine's
 * page_templates.LANDSCAPE_KEYS and the backend's
 * create_design_service.LANDSCAPE_TEMPLATE_KEYS.
 */
export const LANDSCAPE_TEMPLATE_KEYS = [
  "landscape_columns",
  "landscape_rail",
  "landscape_hero",
] as const

/** The default landscape section-page template — the first of the three. */
export const LANDSCAPE_TEMPLATE_KEY = "landscape_columns"

/**
 * The default landscape cover, contents and section-opener design.
 *
 * One key for all three defaults: a landscape report prints these until a
 * person picks another cover or contents page. The openers have no picker of
 * their own — they follow the cover, as in portrait.
 */
export const LANDSCAPE_DESIGN_KEY = "landscape"

/**
 * The landscape covers, default first. Mirrors the engine's
 * cover_templates.LANDSCAPE_KEYS and the backend's
 * report_design_service.LANDSCAPE_COVER_KEYS.
 */
export const LANDSCAPE_COVER_KEYS = ["landscape", "landscape_field", "landscape_quiet"] as const

/**
 * The landscape contents pages, default first. Mirrors the engine's
 * toc_templates.LANDSCAPE_KEYS and the backend's
 * report_design_service.LANDSCAPE_TOC_KEYS.
 */
export const LANDSCAPE_TOC_KEYS = ["landscape", "landscape_three", "landscape_spread"] as const

/** The names the section cards and rail chips show for the landscape templates. */
export const LANDSCAPE_TEMPLATE_NAMES: Record<string, string> = {
  landscape_columns: "Landscape — figures + columns",
  landscape_rail: "Landscape — figure rail",
  landscape_hero: "Landscape — brand hero",
}

/**
 * The same templates' short names, for a sentence that already says
 * "landscape" — e.g. "Use Figure rail for all sections".
 */
export const LANDSCAPE_TEMPLATE_SHORT_NAMES: Record<string, string> = {
  landscape_columns: "Figures + columns",
  landscape_rail: "Figure rail",
  landscape_hero: "Brand hero",
}

/** The names the cover picker and the rail show for the landscape covers. */
export const LANDSCAPE_COVER_NAMES: Record<string, string> = {
  landscape: "Split",
  landscape_field: "Full brand",
  landscape_quiet: "Quiet statement",
}

/** The names the contents picker and the rail show for the landscape contents pages. */
export const LANDSCAPE_TOC_NAMES: Record<string, string> = {
  landscape: "Brand panel",
  landscape_three: "Three columns",
  landscape_spread: "Brand spread",
}

/**
 * The names of the landscape section openers. Each cover brings its own
 * (Split → Brand half, Full brand → Full brand, Quiet statement → Giant
 * numeral); the cover picker names the one that comes with it.
 */
export const LANDSCAPE_OPENER_NAMES: Record<string, string> = {
  landscape: "Brand half",
  landscape_field: "Full brand",
  landscape_numeral: "Giant numeral",
}

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
 * Whether a key is one of the landscape section-page templates.
 *
 * @returns true for the three landscape keys, false for anything else
 */
export function isLandscapeTemplateKey(key: string | null | undefined): boolean {
  if (!key) return false
  return (LANDSCAPE_TEMPLATE_KEYS as readonly string[]).includes(key)
}

/**
 * The template cards a page offers in landscape: the three landscape templates.
 *
 * Shaped like the portrait fallback cards on the Create Design screen. Never
 * marked recommended and carries no counts, because the art director never
 * looked at them — in landscape the person picks.
 *
 * @returns one option per landscape section-page template, default first
 */
export function landscapeOptions(): DesignOption[] {
  const options: DesignOption[] = []
  for (const key of LANDSCAPE_TEMPLATE_KEYS) {
    options.push({
      key,
      recommended: false,
      reason: null,
      counts: {},
      dropped: {},
    })
  }
  return options
}

/**
 * The landscape template "Use for all sections" applies: the card on screen.
 *
 * That is the card being looked at, else the page's own landscape pick, else
 * the default — so the button always names what the person is looking at.
 *
 * @returns one of the landscape section-page template keys
 */
export function landscapeKeyToApply(
  previewKey: string | null,
  unit: Pick<UnitPicks, "landscape_template_key"> | null,
): string {
  if (previewKey && isLandscapeTemplateKey(previewKey)) return previewKey
  const picked = unit?.landscape_template_key
  if (picked && isLandscapeTemplateKey(picked)) return picked
  return LANDSCAPE_TEMPLATE_KEY
}

/** The two landscape front-matter picks of a saved design record. */
interface LandscapeFrontMatter {
  landscape_cover_template_key?: string | null
  landscape_toc_template_key?: string | null
}

/**
 * The landscape cover a report prints: its saved pick, else the default.
 *
 * A saved value this screen does not know (a design since removed, or a
 * typo from somewhere else) reads as the default, which is also what the
 * backend sends the engine for it.
 *
 * @returns one of LANDSCAPE_COVER_KEYS
 */
export function landscapeCoverKey(design?: LandscapeFrontMatter | null): string {
  const saved = design?.landscape_cover_template_key
  if (saved && (LANDSCAPE_COVER_KEYS as readonly string[]).includes(saved)) return saved
  return LANDSCAPE_DESIGN_KEY
}

/**
 * The landscape contents page a report prints: its saved pick, else the
 * default. Same rules as landscapeCoverKey.
 *
 * @returns one of LANDSCAPE_TOC_KEYS
 */
export function landscapeTocKey(design?: LandscapeFrontMatter | null): string {
  const saved = design?.landscape_toc_template_key
  if (saved && (LANDSCAPE_TOC_KEYS as readonly string[]).includes(saved)) return saved
  return LANDSCAPE_DESIGN_KEY
}
