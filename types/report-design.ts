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

export interface TypographyRole {
  family: TypographyFamily
  size: number
  weight: TypographyWeight
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
    subheading: { family: "Libre Baskerville", size: 12, weight: 700 },
    body: { family: "Source Serif 4", size: 11, weight: 400 },
  },
  minimal: {
    heading: { family: "Inter", size: 16, weight: 400 },
    subheading: { family: "Inter", size: 11, weight: 700 },
    body: { family: "Lato", size: 11, weight: 400 },
  },
  bold: {
    heading: { family: "Inter", size: 18, weight: 700 },
    subheading: { family: "Inter", size: 12, weight: 700 },
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
