/**
 * Custom page templates on the Create Design screen: one layout an AI designer
 * wrote for one section.
 *
 * Kept in one place because three things draw pages — the page panel, the
 * whole-report preview and the pre-warm — and each needs the same three
 * answers: does this page have a custom template for the sheet on screen,
 * what cache key does its picture live under, and what extra fields does
 * the render request need.
 */
import type { CustomPaper, CustomTemplate, DesignUnit } from "@/lib/api/createDesign"
import { keyForFormat, type LandscapeFormat, type Orientation } from "@/lib/orientation"

export const CUSTOM_TEMPLATE_KEY = "custom"

/**
 * Whether Create Design shows custom templates at all: the "Create a custom
 * template" button, the Custom card, and a saved custom pick in the page
 * panel. Hidden on 2026-10-15 for a meeting because the feature is not ready;
 * set back to true to bring it all back.
 */
export const SHOW_CUSTOM_TEMPLATES = true

/** The sheet the screen is on, in the words the custom template API uses. */
export function paperFor(orientation: Orientation, format: LandscapeFormat): CustomPaper {
  if (orientation === "portrait") return "portrait"
  return format === "presentation" ? "presentation" : "landscape"
}

/**
 * The page's custom template for the sheet on screen, or null.
 *
 * A landscape custom template made on A4 does not count on the 16:9 sheet (or
 * the reverse): it was designed for its own sheet and prints only there.
 */
export function customTemplateFor(
  unit: Pick<DesignUnit, "custom_template" | "landscape_custom_template"> | null,
  orientation: Orientation,
  format: LandscapeFormat,
): CustomTemplate | null {
  if (!unit) return null
  const stored = orientation === "portrait" ? unit.custom_template : unit.landscape_custom_template
  if (!stored) return null
  return stored.paper === paperFor(orientation, format) ? stored : null
}

/**
 * The template part of a render cache key.
 *
 * A custom template's pictures are keyed by WHEN it was made too, so making a
 * new one never serves the old one's pictures from memory.
 */
export function renderTemplateTag(
  templateKey: string,
  unit: Pick<DesignUnit, "custom_template" | "landscape_custom_template">,
  orientation: Orientation,
  format: LandscapeFormat,
): string {
  if (templateKey !== CUSTOM_TEMPLATE_KEY) return keyForFormat(templateKey, format)
  const made = customTemplateFor(unit, orientation, format)?.created_at ?? "none"
  return keyForFormat(`${CUSTOM_TEMPLATE_KEY}:${made}`, format)
}

/** The extra render fields a "custom" page needs; nothing for any other template. */
export function customRenderFields(
  templateKey: string | null | undefined,
  sectionCode: string,
  orientation: Orientation,
): { section_code?: string; orientation?: Orientation } {
  if (templateKey !== CUSTOM_TEMPLATE_KEY) return {}
  return { section_code: sectionCode, orientation }
}
