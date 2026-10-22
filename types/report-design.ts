/**
 * How a report looks: the cover layout, the brand colours, the type.
 *
 * The same three settings every report kind in the platform stores. The shapes
 * mirror what the export engine accepts exactly — it rejects anything outside
 * its own allowlists with a 422, and this app's backend validates against a copy
 * of those lists so a bad value fails at save rather than at download.
 */

import type { LandscapeFormat, Orientation } from "@/lib/orientation"

// Defined once, in lib/orientation.ts beside the helpers that read it, and
// re-exported so anything already importing design types finds it here too.
export type { LandscapeFormat, Orientation }

export type TypographyFamily =
  | "DejaVu Sans"
  | "Inter"
  | "IBM Plex Sans"
  | "Lato"
  | "Source Serif 4"
  | "Merriweather"
  | "Libre Baskerville"

/** Regular or Bold. The renderer supports no other weights. */
export type TypographyWeight = 400 | 700

/**
 * The four settings that style a subheading *inside* a section's body — the
 * engine's h3/h4 — as opposed to the section title (h2), which the `heading`
 * role owns. They live on `typography.subheading` because that is the role
 * already carrying the family, size and weight those headings are drawn with.
 *
 * Every default below reproduces what the renderer printed before these
 * existed, so an untouched design looks exactly as it did.
 */
export type SubheadingNumbering = "numbered" | "plain"
export type SubheadingCase = "normal" | "upper"
export type SubheadingSpacing = "tight" | "normal" | "loose"
export type SubheadingColor = "body" | "brand"

export interface TypographyRole {
  family: TypographyFamily
  size: number
  weight: TypographyWeight
  // Subheading-only, and optional: a typography object stored before these
  // controls shipped simply has no such keys. Read them through
  // `subheadingStyle()` rather than directly so a missing key resolves to the
  // default instead of `undefined`.
  /** `plain` drops the "N.M " prefix the document numbers subheadings with. */
  numbering?: SubheadingNumbering
  /** `upper` prints the subheading in capitals (text-transform, not the text). */
  case?: SubheadingCase
  /** How much air sits above and below a subheading. */
  spacing?: SubheadingSpacing
  /** Body ink, or the report's own primary. */
  color?: SubheadingColor
}

export interface Typography {
  heading: TypographyRole
  subheading: TypographyRole
  body: TypographyRole
}

/**
 * A brand as five inks, every one optional.
 *
 * Optional is load-bearing, not laziness. Cycles saved before the palette grew
 * past two colours carry only `primary`/`secondary`, and the API still returns
 * those two-key objects verbatim — so anything reading `accent`, `text` or
 * `light` has to cope with the key being absent rather than assume a string.
 */
export interface BrandColors {
  primary?: string
  secondary?: string
  /** The third colour, for highlights and callouts. */
  accent?: string
  /** The dark readable ink body copy is set in. */
  text?: string
  /** The pale tint for rules, dividers and table banding. */
  light?: string
  /** A preset's key, or "custom" when someone typed their own hex. */
  palette_key?: string
}

/**
 * One preset in the picker. `accent`/`text`/`light` are optional here for the
 * same reason as above: a cached or older catalogue response carries only the
 * two colours the presets used to have.
 */
export interface ColorPalette {
  key: string
  name: string
  primary: string
  secondary: string
  accent?: string
  text?: string
  light?: string
}

export interface CoverTemplate {
  key: string
  name: string
  description?: string
  preview_image_url?: string | null
  layout?: Record<string, unknown>
  is_default?: boolean
}

/** What a company set as its default on the Brand Identity page. */
export interface CompanyDesignDefault {
  cover_template_key: string | null
  brand: BrandColors
  typography: Typography | null
  /**
   * Optional, because the company-defaults validator has historically accepted
   * only cover/toc/typography and silently DROPPED anything else — which is
   * why a company-level annual cover could never be saved even though the
   * resolver reads one. Declared optional rather than required so this type
   * stays honest whether or not a given deployment has that fix.
   */
  toc_template_key?: string | null
  cover2_template_key?: string | null
  divider_template_key?: string | null
  header_footer?: HeaderFooter | null
}

export interface AnnualDesign {
  cycle_id: string
  cover_template_key: string | null
  /** The cycle's OWN contents-design pick, null when it has never chosen. */
  toc_template_key: string | null
  cover2_template_key: string | null
  /** The cycle's OWN section-opener pick, null when it has never chosen. */
  divider_template_key: string | null
  /** The cycle's OWN running-band settings, null when it has never chosen. */
  header_footer: HeaderFooter | null
  brand: BrandColors
  typography: Typography | null
  company_default: CompanyDesignDefault | null
  /**
   * True once the report's blueprint is locked — the structure is settled, so
   * the look is settled with it.
   *
   * This used to read a shared row's `status`, which one app sets to 'approved'
   * on every assemble to mean "mirrored" while the other reads it as "a human
   * signed this off". The result was a report that could never be designed at
   * all: refused before assembly because the row did not exist, refused after
   * because it already said approved.
   */
  locked: boolean
  /**
   * Which way the report prints. The backend sends "portrait" for a report
   * that has never chosen, but read it through `orientationOf()` anyway: a
   * backend deployed before landscape existed omits the key entirely.
   */
  orientation: Orientation
  /**
   * The cycle's OWN landscape cover pick, null when it has never chosen (the
   * report then prints the default, "landscape"). Read it through
   * `landscapeCoverKey()`: a backend deployed before there was a choice omits
   * the key entirely.
   */
  landscape_cover_template_key?: string | null
  /** The cycle's OWN landscape contents pick. Same rules — read it through `landscapeTocKey()`. */
  landscape_toc_template_key?: string | null
  /**
   * The landscape section opener chosen on its own, null when the opener
   * follows the cover. Read it through `landscapeOpenerChoice()`.
   */
  landscape_divider_template_key?: string | null
  /**
   * The sheet a landscape report prints on: "a4" or the 16:9 "presentation"
   * sheet. Kept while the report is portrait. Read it through
   * `landscapeFormatOf()`: a backend deployed before the format existed omits it.
   */
  landscape_format?: LandscapeFormat | null
}

/** Which of the three running-band looks the renderer draws. */
export type HeaderStyle = "auto" | "classic" | "minimal" | "bold"

export const HEADER_STYLES: { value: HeaderStyle; label: string; blurb: string }[] = [
  { value: "auto", label: "Match the cover",
    blurb: "Follows the cover you picked. What every report does today." },
  { value: "classic", label: "Classic",
    blurb: "Letterhead — logo, section name, report and period, over a rule." },
  { value: "minimal", label: "Minimal",
    blurb: "A rule and the logo. No running text at the head of the page." },
  { value: "bold", label: "Bold",
    blurb: "Full-bleed brand bars, with a section strip across the head." },
]

/**
 * The running header and footer.
 *
 * `style` sits at the TOP level rather than inside `header`, because the bold
 * style paints the top band AND the bottom band and moves the footer to
 * on-brand ink. A `header.style` that silently restyled the footer would be a
 * lie in the shape.
 *
 * Under `bold` the section strip IS the header, so `show_section_name` has no
 * meaning there — the tab greys it out rather than offering a dead control.
 */
export interface HeaderFooter {
  style: HeaderStyle
  header: { enabled: boolean; show_logo: boolean; show_section_name: boolean }
  footer: { enabled: boolean; show_page_numbers: boolean }
}

/**
 * Exactly what the renderer does today, so touching the tab changes nothing
 * until a control is moved. Absence of the whole key is the real opt-out —
 * these are what the first edit starts from.
 */
export const HEADER_FOOTER_DEFAULTS: HeaderFooter = {
  style: "auto",
  header: { enabled: true, show_logo: true, show_section_name: true },
  footer: { enabled: true, show_page_numbers: true },
}

/** The body of a save. Every field optional: one control can be saved alone. */
export interface DesignSelection {
  cover_template_key?: string
  brand?: BrandColors
  typography?: Typography | null
  /**
   * One of the five section-opener designs. Absent is the OPT-OUT, as with
   * the contents page below: the engine then derives the opener from the
   * cover, exactly as it always has.
   */
  divider_template_key?: string
  /** The running bands. Absent = today's behaviour, derived from the cover. */
  header_footer?: HeaderFooter
  /**
   * Which of the five contents-page designs this report prints.
   *
   * Absent is not "the default" — it is the OPT-OUT. A report that has never
   * chosen one renders the flat contents page every other report family still
   * gets, so omitting this key is how the engine knows to leave the page
   * alone. Set from the Create Design screen, not from the cover modal.
   */
  toc_template_key?: string
  /** Which of the four annual covers this report prints. Absent = the original. */
  cover2_template_key?: string
  /**
   * Portrait or landscape. Absent leaves the saved orientation alone, like
   * every other field here. Switching keeps both orientations' page picks —
   * it only decides which set the screen and the export read.
   */
  orientation?: Orientation
  /**
   * Which of the three landscape covers a landscape report prints. Kept apart
   * from `cover2_template_key`, so each orientation remembers its own cover.
   * Absent leaves the saved pick alone.
   */
  landscape_cover_template_key?: string
  /** Which of the three landscape contents pages a landscape report prints. Same rules. */
  landscape_toc_template_key?: string
  /**
   * The landscape section opener chosen on its own (e.g. "landscape_split"),
   * or "" to have it follow the cover again. Absent leaves the saved choice alone.
   */
  landscape_divider_template_key?: string
  /**
   * The sheet a landscape report prints on. Sent with `orientation:
   * "landscape"` by the page-format switch; absent leaves it alone.
   */
  landscape_format?: LandscapeFormat
}

/** One contents-page design, as the engine that owns them describes it. */
export interface CoverDesign {
  key: string
  purpose: string
  full_bleed: boolean
  /** The divider treatment this cover brings with it. */
  divider: string
  /** The engine's own name for it. Sent for the landscape designs only. */
  name?: string
}

export interface CoverPreview {
  design: string
  page_count: number
  divider: string
  pages: string[]
}

export interface TocDesign {
  key: string
  purpose: string
  full_bleed: boolean
  sub_page_numbers: boolean
  /** The engine's own name for it. Sent for the landscape designs only. */
  name?: string
}

/**
 * The cover designs, as `/pm/cover-designs` lists them.
 *
 * `templates` is the portrait menu only. The landscape covers sit apart so no
 * portrait picker can offer them: `landscape` is the default one and
 * `landscape_templates` all three, default first. Both are optional because an
 * engine deployed before landscape existed sends neither; an engine from
 * before there was a choice sends only `landscape`, and annualDesignApi then
 * fills `landscape_templates` with that one.
 */
export interface CoverDesignSpecs {
  templates: CoverDesign[]
  default: string
  landscape?: CoverDesign
  landscape_templates?: CoverDesign[]
}

/** The contents designs, as `/pm/toc-designs` lists them. Same split as covers. */
export interface TocDesignSpecs {
  templates: TocDesign[]
  default: string
  landscape?: TocDesign
  landscape_templates?: TocDesign[]
}

/** A rendered preview of one design — one PNG data URI per sheet. */
export interface TocPreview {
  design: string
  page_count: number
  entries: number
  depth: number
  /** True when the folios drawn are illustrative rather than resolved. */
  estimated_pages: boolean
  pages: string[]
}

// Per-role size limits, matching the backend's report_typography._SIZE_RANGES.
// It rejects anything outside these with a 422, so the steppers clamp to them.
export const SIZE_RANGES: Record<keyof Typography, [number, number]> = {
  heading: [14, 22],
  subheading: [11, 14],
  body: [10, 12],
}

/** Every subheading option resolved — nothing optional, nothing undefined. */
export interface SubheadingStyle {
  numbering: SubheadingNumbering
  case: SubheadingCase
  spacing: SubheadingSpacing
  color: SubheadingColor
}

/**
 * One segmented control: which key it writes, its label, and its buttons.
 *
 * Written as a union of per-key shapes rather than one widened shape so each
 * control's values are checked against *its own* key — `{ key: "case", options:
 * [{ value: "loose" }] }` is a compile error, which a `value: string` list
 * would have waved through.
 */
type ControlFor<K extends keyof SubheadingStyle> = {
  key: K
  label: string
  options: readonly { readonly value: SubheadingStyle[K]; readonly label: string }[]
}

export type SubheadingStyleControl =
  | ControlFor<"numbering">
  | ControlFor<"case">
  | ControlFor<"spacing">
  | ControlFor<"color">

/**
 * The allowlist the subheading controls are built from, in button order.
 *
 * One list, walked by the UI to draw the segments — adding a value means
 * editing this and nothing else. The first value of each control is its
 * default, i.e. what the renderer did before any of this was settable.
 */
export const SUBHEADING_STYLE_CONTROLS: readonly SubheadingStyleControl[] = [
  {
    key: "numbering",
    label: "Numbering",
    options: [
      { value: "numbered", label: "Numbered" },
      { value: "plain", label: "Plain" },
    ],
  },
  {
    key: "case",
    label: "Case",
    options: [
      { value: "normal", label: "Normal" },
      { value: "upper", label: "UPPERCASE" },
    ],
  },
  {
    key: "spacing",
    label: "Spacing",
    options: [
      { value: "tight", label: "Tight" },
      { value: "normal", label: "Normal" },
      { value: "loose", label: "Loose" },
    ],
  },
  {
    key: "color",
    label: "Colour",
    options: [
      { value: "body", label: "Body ink" },
      { value: "brand", label: "Brand" },
    ],
  },
]

export const SUBHEADING_STYLE_DEFAULTS: SubheadingStyle = {
  numbering: "numbered",
  case: "normal",
  spacing: "normal",
  color: "body",
}

/**
 * A role's subheading options with the defaults filled in.
 *
 * The single place a missing key becomes a concrete value. Both previews and
 * the "Customised" comparison go through it, so a design saved before these
 * controls existed renders — and compares — as the defaults rather than as a
 * hole.
 */
export function subheadingStyle(role: TypographyRole): SubheadingStyle {
  return {
    numbering: role.numbering ?? SUBHEADING_STYLE_DEFAULTS.numbering,
    case: role.case ?? SUBHEADING_STYLE_DEFAULTS.case,
    spacing: role.spacing ?? SUBHEADING_STYLE_DEFAULTS.spacing,
    color: role.color ?? SUBHEADING_STYLE_DEFAULTS.color,
  }
}

export const FAMILIES: { value: TypographyFamily; label: string }[] = [
  { value: "DejaVu Sans", label: "Default (system sans)" },
  { value: "Inter", label: "Inter" },
  { value: "IBM Plex Sans", label: "IBM Plex Sans" },
  { value: "Lato", label: "Lato" },
  { value: "Source Serif 4", label: "Source Serif 4" },
  { value: "Merriweather", label: "Merriweather" },
  { value: "Libre Baskerville", label: "Libre Baskerville" },
]

/**
 * Each layout's recommended type, mirroring the backend's
 * LAYOUT_TYPOGRAPHY_DEFAULTS. Used when someone switches layout and has not
 * customised the type themselves, and as the target of "Reset to recommended".
 */
export const LAYOUT_TYPOGRAPHY: Record<string, Typography> = {
  classic: {
    heading: { family: "Libre Baskerville", size: 16, weight: 700 },
    subheading: {
      family: "Libre Baskerville", size: 12, weight: 700,
      ...SUBHEADING_STYLE_DEFAULTS,
    },
    body: { family: "Source Serif 4", size: 11, weight: 400 },
  },
  minimal: {
    heading: { family: "Inter", size: 16, weight: 400 },
    subheading: {
      family: "Inter", size: 11, weight: 700,
      ...SUBHEADING_STYLE_DEFAULTS,
    },
    body: { family: "Lato", size: 11, weight: 400 },
  },
  bold: {
    heading: { family: "Inter", size: 18, weight: 700 },
    subheading: {
      family: "Inter", size: 12, weight: 700,
      ...SUBHEADING_STYLE_DEFAULTS,
    },
    body: { family: "Inter", size: 11, weight: 400 },
  },
}

export const DEFAULT_LAYOUT_KEY = "classic"

/**
 * Which of the three cover designs a template key draws.
 *
 * The catalogue holds a fourth, `branded`, which the pickers deliberately do not
 * offer — it exists for the exporter but has never been reachable from any UI.
 * Anything unrecognised falls back to classic, which is the catalogue default.
 */
export function coverVariant(key?: string | null): "classic" | "bold" | "minimal" {
  const k = (key || "").toLowerCase()
  if (k.includes("bold")) return "bold"
  if (k.includes("minimal") || k.includes("clean")) return "minimal"
  return "classic"
}
