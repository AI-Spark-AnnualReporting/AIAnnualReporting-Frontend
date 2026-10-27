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
// The ".ts" extension lets `node lib/orientation.test.ts` load this file too.
import { TABLES_ONLY_TEMPLATE_KEYS } from "./createDesignLoss.ts"

export type Orientation = "portrait" | "landscape"

/**
 * The sheet a LANDSCAPE report prints on: A4 landscape, or the 16:9
 * presentation sheet (PowerPoint's 13.33 x 7.5 in). Both use the same
 * landscape designs and the same landscape picks — only the paper differs.
 */
export type LandscapeFormat = "a4" | "presentation"

/**
 * The three choices on the Create Design switch: portrait A4, landscape A4,
 * or landscape on the presentation sheet. Stored as two fields
 * (`orientation` + `landscape_format`) so every landscape pick serves both
 * landscape sheets — see selectionForPageFormat.
 */
export type PageFormat = "portrait" | "landscape" | "presentation"

/** What the switch's three buttons say. */
export const PAGE_FORMAT_LABELS: Record<PageFormat, string> = {
  portrait: "Portrait (A4)",
  landscape: "Landscape (A4)",
  presentation: "Presentation (16:9)",
}

/**
 * The landscape section-page templates, default first. Mirrors the engine's
 * page_templates.LANDSCAPE_KEYS and the backend's
 * create_design_service.LANDSCAPE_TEMPLATE_KEYS.
 */
export const LANDSCAPE_TEMPLATE_KEYS = [
  "landscape_columns",
  "landscape_rail",
  "landscape_hero",
  "landscape_picture",
  "landscape_statement",
  "landscape_schedule",
  "landscape_essay",
  "landscape_tiles",
  "landscape_tables",
  "landscape_editorial",
  "landscape_portrait",
  "landscape_photo_panel",
  "landscape_people",
  "landscape_borderless_table",
  "landscape_grid_table",
  "landscape_striped_table",
  "landscape_zebra_table",
] as const

/** The default landscape section-page template — the first in the list. */
export const LANDSCAPE_TEMPLATE_KEY = "landscape_columns"

/**
 * The default landscape cover, contents and section-opener design.
 *
 * One key for all three defaults: a landscape report prints these until a
 * person picks another cover or contents page. The section opener follows the
 * cover unless one is chosen on its own (see LANDSCAPE_OPENER_KEYS).
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
  landscape_picture: "Landscape — picture spread",
  landscape_statement: "Landscape — statement",
  landscape_schedule: "Landscape — schedule",
  landscape_essay: "Landscape — essay",
  landscape_tiles: "Landscape — stat tiles",
  landscape_tables: "Landscape — data tables",
  landscape_editorial: "Landscape — editorial columns",
  landscape_portrait: "Landscape — portrait + stats",
  landscape_photo_panel: "Landscape — photo + panel",
  landscape_people: "Landscape — people",
  landscape_borderless_table: "Landscape — borderless table",
  landscape_grid_table: "Landscape — grid table",
  landscape_striped_table: "Landscape — striped table",
  landscape_zebra_table: "Landscape — zebra table",
}

/**
 * The same templates' short names, for a sentence that already says
 * "landscape" — e.g. "Use Figure rail for all sections".
 */
export const LANDSCAPE_TEMPLATE_SHORT_NAMES: Record<string, string> = {
  landscape_columns: "Figures + columns",
  landscape_rail: "Figure rail",
  landscape_hero: "Brand hero",
  landscape_picture: "Picture spread",
  landscape_statement: "Statement",
  landscape_schedule: "Schedule",
  landscape_essay: "Essay",
  landscape_tiles: "Stat tiles",
  landscape_tables: "Data tables",
  landscape_editorial: "Editorial columns",
  landscape_portrait: "Portrait + stats",
  landscape_photo_panel: "Photo + panel",
  landscape_people: "People",
  landscape_borderless_table: "Borderless table",
  landscape_grid_table: "Grid table",
  landscape_striped_table: "Striped table",
  landscape_zebra_table: "Zebra table",
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
 * The landscape section openers. Mirrors the engine's
 * divider_templates.LANDSCAPE_KEYS and the backend's
 * report_design_service.LANDSCAPE_OPENER_KEYS.
 */
export const LANDSCAPE_OPENER_KEYS = [
  "landscape", "landscape_field", "landscape_numeral", "landscape_split",
] as const

/**
 * The names of the landscape section openers. Each cover brings its own
 * (Split → Brand half, Full brand → Full brand, Quiet statement → Giant
 * numeral); the cover picker names the one that comes with it. Split artwork
 * comes with no cover: it is only ever chosen on its own.
 */
export const LANDSCAPE_OPENER_NAMES: Record<string, string> = {
  landscape: "Brand half",
  landscape_field: "Full brand",
  landscape_numeral: "Giant numeral",
  landscape_split: "Split artwork",
}

/**
 * The portrait section openers. Mirrors the engine's divider_templates.KEYS
 * and the backend's report_design_service.DIVIDER_TEMPLATE_KEYS. Create
 * Design offers only Split artwork among them; the others come with the
 * covers, or were chosen before this screen offered a choice.
 */
export const PORTRAIT_OPENER_KEYS = [
  "rule", "banded", "full", "figure", "numeral", "split",
] as const

/** The names of the portrait section openers, for saying which one is chosen. */
export const PORTRAIT_OPENER_NAMES: Record<string, string> = {
  rule: "Ruled",
  banded: "Banded",
  full: "Full brand",
  figure: "Figure",
  numeral: "Numeral",
  split: "Split artwork",
}

/**
 * The sheet a landscape report prints on, from its saved design record.
 *
 * Anything other than "presentation" reads as "a4" — including a missing key,
 * which is what every report saved before the format existed carries.
 *
 * @returns "presentation" only when the record says so, else "a4"
 */
export function landscapeFormatOf(
  design?: { landscape_format?: string | null } | null,
): LandscapeFormat {
  if (design?.landscape_format === "presentation") return "presentation"
  return "a4"
}

/**
 * Which of the switch's three buttons a saved design record is.
 *
 * @returns "portrait", "landscape" (A4) or "presentation" (16:9)
 */
export function pageFormatOf(
  design?: { orientation?: string | null; landscape_format?: string | null } | null,
): PageFormat {
  if (orientationOf(design) === "portrait") return "portrait"
  if (landscapeFormatOf(design) === "presentation") return "presentation"
  return "landscape"
}

/**
 * The fields to save for one button of the switch.
 *
 * Portrait leaves the landscape sheet alone, so going back to landscape lands
 * on the sheet the report was on before.
 *
 * @returns the design fields the backend's PATCH takes
 */
export function selectionForPageFormat(
  next: PageFormat,
): { orientation: Orientation; landscape_format?: LandscapeFormat } {
  if (next === "portrait") return { orientation: "portrait" }
  if (next === "presentation") return { orientation: "landscape", landscape_format: "presentation" }
  return { orientation: "landscape", landscape_format: "a4" }
}

/**
 * A render cache key or a preview query key for a design drawn on this sheet.
 *
 * Both landscape sheets draw the same template keys, so without this a 16:9
 * screen would be handed the A4 picture of the same page. A4 keys come back
 * unchanged, so nothing already cached moves; a presentation key gets a
 * suffix after the template, which keeps every prefix the cache revokes by.
 *
 * @returns `key`, or `key@16:9` on the presentation sheet
 */
export function keyForFormat(key: string, format: LandscapeFormat): string {
  if (format === "presentation") return `${key}@16:9`
  return key
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

// The presentation sheet, which the engine prints at exactly this size.
const PRESENTATION_WIDTH_PT = 960
const PRESENTATION_HEIGHT_PT = 540

/**
 * The size of one printed page, for drawing previews the right shape.
 *
 * @param format  the landscape sheet; ignored for portrait
 * @returns width and height in points; landscape is portrait turned sideways,
 *          or the 16:9 sheet when the format is "presentation"
 */
export function pageSize(
  orientation: Orientation,
  format: LandscapeFormat = "a4",
): { width: number; height: number } {
  if (orientation === "landscape" && format === "presentation") {
    return { width: PRESENTATION_WIDTH_PT, height: PRESENTATION_HEIGHT_PT }
  }
  if (orientation === "landscape") {
    return { width: A4_HEIGHT_PT, height: A4_WIDTH_PT }
  }
  return { width: A4_WIDTH_PT, height: A4_HEIGHT_PT }
}

/**
 * Whether a key is one of the landscape section-page templates.
 *
 * @returns true for a key in LANDSCAPE_TEMPLATE_KEYS, false for anything else
 */
export function isLandscapeTemplateKey(key: string | null | undefined): boolean {
  if (!key) return false
  return (LANDSCAPE_TEMPLATE_KEYS as readonly string[]).includes(key)
}

/**
 * Landscape templates that print EXACTLY what a portrait one does — the same
 * filling code in the engine, only the paper differs — so their card can show
 * the portrait card's counts. Borderless, Grid, Striped and Zebra table leave the text,
 * figures and quotes out, and without these counts their landscape cards
 * would never show the red "Content missing" line.
 */
const LANDSCAPE_COUNTS_FROM: Record<string, string> = {
  landscape_borderless_table: "borderless_table",
  landscape_grid_table: "grid_table",
  landscape_striped_table: "striped_table",
  landscape_zebra_table: "zebra_table",
}

/**
 * The template cards a page offers in landscape: every landscape template.
 *
 * Shaped like the portrait fallback cards on the Create Design screen. Never
 * marked recommended, because the art director never looked at them — in
 * landscape the person picks. No counts either, except on a template that
 * prints exactly what a portrait one does (LANDSCAPE_COUNTS_FROM): that card
 * copies the portrait card's counts and losses from `portraitOptions`.
 *
 * @param portraitOptions the page's stored portrait cards, if any
 * @returns one option per landscape section-page template, default first
 */
export function landscapeOptions(portraitOptions: DesignOption[] = []): DesignOption[] {
  const options: DesignOption[] = []
  for (const key of LANDSCAPE_TEMPLATE_KEYS) {
    const twin = portraitOptions.find((option) => option.key === LANDSCAPE_COUNTS_FROM[key])
    options.push({
      key,
      recommended: false,
      reason: null,
      counts: twin ? { ...twin.counts } : {},
      dropped: twin ? { ...twin.dropped } : {},
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

/**
 * What the "Use for all sections" button says for the template it applies.
 *
 * A tables-only template (Borderless, Grid, Striped, Zebra table) prints just
 * the heading and the tables, so the backend puts it only on sections that
 * have tables — the button says so up front, or a person would expect every
 * section to change.
 *
 * @param templateKey the landscape template the button applies
 * @param name        the name to show for it
 * @returns "Use <name> for all sections", plus " with tables" when tables-only
 */
export function applyToAllLabel(templateKey: string, name: string): string {
  if (TABLES_ONLY_TEMPLATE_KEYS.includes(templateKey)) {
    return `Use ${name} for all sections with tables`
  }
  return `Use ${name} for all sections`
}

/**
 * The toast after "Use for all sections", naming the template applied.
 *
 * @param applied         how many pages the backend filled
 * @param templateKey     the landscape template applied
 * @param name            the name to show for it
 * @param skippedNoTables sections left alone because they have no tables;
 *                        absent from an older backend's reply, read as 0
 * @returns the sentence to show
 */
export function landscapeAppliedText(
  applied: number,
  templateKey: string,
  name: string,
  skippedNoTables = 0,
): string {
  if (!TABLES_ONLY_TEMPLATE_KEYS.includes(templateKey)) {
    if (applied === 0) return "Every section already has a landscape template"
    if (applied === 1) return `${name} applied to 1 section`
    return `${name} applied to ${applied} sections`
  }
  // Nothing applied and some sections skipped: none of the sections still
  // waiting for a landscape template has a table. "Every section with tables
  // already has one" read oddly when the report has no tables at all.
  if (applied === 0 && skippedNoTables === 1) {
    return `${name} was not applied: the 1 section without a landscape template has no tables`
  }
  if (applied === 0 && skippedNoTables > 1) {
    return `${name} was not applied: none of the ${skippedNoTables} sections without a landscape template has tables`
  }
  let text = `${name} applied to ${applied} sections with tables`
  if (applied === 0) text = "Every section with tables already has a landscape template"
  if (applied === 1) text = `${name} applied to 1 section with tables`
  if (skippedNoTables === 1) return `${text}. 1 section without tables was left as it was`
  if (skippedNoTables > 1) return `${text}. ${skippedNoTables} sections without tables were left as they were`
  return text
}

/** The landscape front-matter picks of a saved design record. */
interface LandscapeFrontMatter {
  landscape_cover_template_key?: string | null
  landscape_toc_template_key?: string | null
  landscape_divider_template_key?: string | null
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

/**
 * The landscape section opener chosen on its own, or null when the opener
 * follows the cover (never chosen, set back, or a value this screen does not
 * know — which the backend does not send on either).
 *
 * @returns one of LANDSCAPE_OPENER_KEYS, or null
 */
export function landscapeOpenerChoice(design?: LandscapeFrontMatter | null): string | null {
  const saved = design?.landscape_divider_template_key
  if (saved && (LANDSCAPE_OPENER_KEYS as readonly string[]).includes(saved)) return saved
  return null
}

/**
 * The portrait section opener chosen on its own, or null when the opener
 * follows the cover (never chosen, set back, or a value this screen does not
 * know — which the backend does not send on either). Same rules as
 * landscapeOpenerChoice, read from the portrait field.
 *
 * @returns one of PORTRAIT_OPENER_KEYS, or null
 */
export function portraitOpenerChoice(
  design?: { divider_template_key?: string | null } | null,
): string | null {
  const saved = design?.divider_template_key
  if (saved && (PORTRAIT_OPENER_KEYS as readonly string[]).includes(saved)) return saved
  return null
}

/**
 * Every title page one section can choose, for the page shape on screen, in
 * the engine's order, with the name the screen shows for each.
 */
export function sectionOpenerOptions(
  orientation: Orientation,
): { key: string; name: string }[] {
  if (orientation === "landscape") {
    return LANDSCAPE_OPENER_KEYS.map((key) => ({ key, name: LANDSCAPE_OPENER_NAMES[key] }))
  }
  return PORTRAIT_OPENER_KEYS.map((key) => ({ key, name: PORTRAIT_OPENER_NAMES[key] }))
}

/**
 * The title page one section chose on its own, or null when it opens on the
 * report's title page (never chosen, set back, or a key this screen does not
 * know). Each page shape keeps its own picks, like the page templates.
 *
 * @returns one of the opener keys for `orientation`, or null
 */
export function sectionOpenerChoice(
  design: {
    section_divider_keys?: Record<string, string> | null
    landscape_section_divider_keys?: Record<string, string> | null
  } | null | undefined,
  sectionCode: string,
  orientation: Orientation,
): string | null {
  const landscape = orientation === "landscape"
  const picks = landscape ? design?.landscape_section_divider_keys : design?.section_divider_keys
  const saved = picks?.[sectionCode]
  const known: readonly string[] = landscape ? LANDSCAPE_OPENER_KEYS : PORTRAIT_OPENER_KEYS
  if (saved && known.includes(saved)) return saved
  return null
}
