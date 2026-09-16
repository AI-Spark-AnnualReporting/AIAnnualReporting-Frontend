/**
 * How a report looks: the cover layout, the brand colours, the type.
 *
 * The same three settings every report kind in the platform stores. The shapes
 * mirror what the export engine accepts exactly — it rejects anything outside
 * its own allowlists with a 422, and this app's backend validates against a copy
 * of those lists so a bad value fails at save rather than at download.
 */

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

export interface BrandColors {
  primary?: string
  secondary?: string
  /** A preset's key, or "custom" when someone typed their own hex. */
  palette_key?: string
}

export interface ColorPalette {
  key: string
  name: string
  primary: string
  secondary: string
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
}

export interface AnnualDesign {
  cycle_id: string
  cover_template_key: string | null
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
}

/** The body of a save. Every field optional: one control can be saved alone. */
export interface DesignSelection {
  cover_template_key?: string
  brand?: BrandColors
  typography?: Typography | null
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
