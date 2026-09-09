/**
 * The annual report's design settings, and the assembled document behind them.
 *
 * These endpoints live on the CENTRIYON backend, not this app's — that is where
 * the shared export engine and the cover-template catalogue are, and where every
 * other report kind already stores the same three settings. Reuses commClient
 * from lib/api/communications, which is already pointed there with the same JWT.
 *
 * Keyed on cycle_id: the `reports` row behind an annual report is a mirror keyed
 * (company_id, 'annual', 'FY-{year}'), which this app has no way to name.
 */

import { commClient } from "@/lib/api/communications"
import type {
  AnnualDesign,
  ColorPalette,
  CoverTemplate,
  DesignSelection,
} from "@/types/report-design"

/** The assembled document, exactly as the exporter will render it. */
export interface AssembledReport {
  cover: {
    template_key?: string | null
    layout?: Record<string, unknown>
    brand?: Record<string, string>
    values?: {
      company_name?: string
      logo_url?: string | null
      title?: string
      headline?: string
      period_label?: string
      prepared_on?: string
      cover_image?: string | null
    }
  } | null
  brand: Record<string, string>
  typography: Record<string, unknown> | null
  sections: {
    section_code: string
    title: string
    display_order: number
    number?: number | null
    mode?: string | null
    content?: unknown
  }[]
}

export const annualDesignApi = {
  /** The cycle's current cover/brand/type choice, for pre-selecting the controls. */
  get: async (cycleId: string): Promise<AnnualDesign> => {
    const { data } = await commClient.get(
      `/annual/cycles/${encodeURIComponent(cycleId)}/cover-template`,
    )
    return data
  },

  /**
   * Save a choice. Every field is optional and an omitted one is left alone, so
   * a control can be saved without clearing the others. Sending `typography:
   * null` clears the override so the report falls back to its layout's
   * recommended type — that is what "reset to recommended" sends.
   */
  save: async (cycleId: string, selection: DesignSelection): Promise<unknown> => {
    const { data } = await commClient.patch(
      `/annual/cycles/${encodeURIComponent(cycleId)}/cover-template`,
      selection,
    )
    return data
  },

  /**
   * The assembled document. The preview reads this rather than building its own
   * view of the report, which is what keeps the screen and the downloaded file
   * showing the same cover, the same order and the same heading numbers.
   */
  assembled: async (cycleId: string): Promise<AssembledReport> => {
    const { data } = await commClient.get(
      `/annual/cycles/${encodeURIComponent(cycleId)}/assemble`,
    )
    return data
  },

  /**
   * The cover catalogue and the colour presets — global reference data shared
   * with every report kind, served under the quarterly path because that is
   * where they have always lived. Not annual-specific, and deliberately not
   * duplicated behind an /annual alias.
   */
  templates: async (): Promise<CoverTemplate[]> => {
    const { data } = await commClient.get(`/reports/quarterly/cover-templates`)
    return data?.cover_templates ?? []
  },

  palettes: async (): Promise<ColorPalette[]> => {
    const { data } = await commClient.get(`/reports/quarterly/color-palettes`)
    return data?.color_palettes ?? []
  },
}

/**
 * Download the report, typeset by the shared export engine.
 *
 * Points at Centriyon rather than this app's own /render: that is where the
 * engine lives, and it is the only way the design chosen in the modal reaches
 * the file. Returns the blob and the filename the server chose.
 */
export async function downloadAnnualReport(
  cycleId: string, format: "pdf" | "docx",
): Promise<{ blob: Blob; filename: string }> {
  const res = await commClient.post(
    `/annual/cycles/${encodeURIComponent(cycleId)}/export`,
    { format },
    { responseType: "blob", timeout: 120000 },
  )
  const disposition = String(res.headers?.["content-disposition"] ?? "")
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)
  return {
    blob: res.data as Blob,
    filename: match ? decodeURIComponent(match[1]) : `Annual_Report.${format}`,
  }
}
