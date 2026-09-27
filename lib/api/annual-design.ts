/**
 * The annual report's design settings, and the assembled document behind them.
 *
 * All of it served by THIS app's backend. It used to be split: the settings and
 * the download lived on the Centriyon backend and the rest of the page here,
 * which cost more than the tidiness was worth.
 *
 *  - the design was stored on a shared `reports` row keyed
 *    (company, fiscal year) that live data has standing behind as many as 25
 *    cycles, so designing one report restyled all of them;
 *  - it was behind a bare authenticated check, so any member of the company
 *    could read and rewrite it;
 *  - and it pointed at a second base URL, which this app's container build
 *    bakes in at compile time — so in production Design and Download silently
 *    aimed at the wrong host while every other part of the page worked.
 *
 * One backend, one URL, one owner.
 */

import { apiClient } from "@/lib/api/client"
import type {
  AnnualDesign,
  ColorPalette,
  CoverTemplate,
  DesignSelection,
  CoverDesign,
  CoverPreview,
  TocDesign,
  TocPreview,
} from "@/types/report-design"

/** The document, exactly as the export engine will print it. */
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
      footnote?: string
      cover_image?: string | null
    }
  } | null
  brand: Record<string, string>
  typography: Record<string, unknown> | null
  content_language?: string
  sections: {
    section_code: string
    title: string
    display_order: number
    number?: number | null
    mode?: string | null
    content?: unknown
    /** Every heading this section will print, with the number it will be given. */
    headings?: { level: number; number: string; text: string }[]
  }[]
  /**
   * False when the export engine could not be reached to apply its own
   * clean-up, so the preview may show a heading the file would drop. Surfaced
   * rather than hidden: it is the difference between a preview slightly ahead
   * of the file and one that is simply wrong.
   */
  normalised?: boolean
}

export const annualDesignApi = {
  /**
   * The cycle's current cover/brand/type choice, for pre-selecting the controls.
   *
   * Cheap, but it runs on the Create Design screen alongside a pre-warm that
   * is drawing pages, so it is queueing behind render work rather than doing
   * any of its own. The client default cut it off at 30s and left the cover
   * and contents pickers with nothing selected.
   */
  get: async (cycleId: string): Promise<AnnualDesign> => {
    const { data } = await apiClient.get(
      `/pm/cycles/${encodeURIComponent(cycleId)}/design`,
      { timeout: 60000 },
    )
    return data
  },

  /**
   * Save a choice. Every field is optional and an omitted one is left alone, so
   * a control can be saved without clearing the others. Sending `typography:
   * null` clears the override so the report falls back to its layout's
   * recommended type — that is what "reset to recommended" sends.
   */
  save: async (cycleId: string, selection: DesignSelection): Promise<AnnualDesign> => {
    const { data } = await apiClient.patch(
      `/pm/cycles/${encodeURIComponent(cycleId)}/design`,
      selection,
      // Same queue as get, above, and this one is a person's choice — losing it
      // to a timeout means they pick the cover again and wonder why.
      { timeout: 60000 },
    )
    return data
  },

  /**
   * The assembled document. The preview reads this rather than building its own
   * view of the report, which is what keeps the screen and the downloaded file
   * showing the same cover, the same order and the same heading numbers.
   */
  assembled: async (cycleId: string): Promise<AssembledReport> => {
    const { data } = await apiClient.get(
      `/pm/cycles/${encodeURIComponent(cycleId)}/assembled`,
    )
    return data
  },

  /**
   * The cover layouts and colour presets — global reference data shared with
   * every report kind. One request, because the modal cannot draw itself
   * without both.
   */
  catalogue: async (): Promise<{
    cover_templates: CoverTemplate[]
    color_palettes: ColorPalette[]
  }> => {
    const { data } = await apiClient.get(`/pm/report-design/catalogue`)
    return {
      cover_templates: data?.cover_templates ?? [],
      color_palettes: data?.color_palettes ?? [],
    }
  },

  /**
   * The five contents-page designs.
   *
   * Proxied from the render engine, which owns them — there is no second list
   * of names and descriptions on this side to fall out of date.
   */
  /**
   * The four annual covers. Proxied from the engine that owns them.
   *
   * Proxied, so it waits on the render engine — the same engine the pre-warm
   * is keeping busy — and then on this backend. Two queues, one list of names.
   */
  coverDesigns: async (): Promise<{ templates: CoverDesign[]; default: string }> => {
    const { data } = await apiClient.get(`/pm/cover-designs`, { timeout: 60000 })
    return { templates: data?.templates ?? [], default: data?.default ?? "statement" }
  },

  /** Draw this cycle's cover in one design, with its real title and brand. */
  previewCover: async (cycleId: string, design: string): Promise<CoverPreview> => {
    const { data } = await apiClient.post(
      `/pm/cycles/${encodeURIComponent(cycleId)}/cover-preview`,
      { design },
      { timeout: 120000 },
    )
    return data
  },

  /** The five contents designs. Proxied too — see coverDesigns for the timeout. */
  tocDesigns: async (): Promise<{ templates: TocDesign[]; default: string }> => {
    const { data } = await apiClient.get(`/pm/toc-designs`, { timeout: 60000 })
    return {
      templates: data?.templates ?? [],
      default: data?.default ?? "classic",
    }
  },

  /**
   * Draw this cycle's contents page in one design.
   *
   * Uses the report's real sections, so a PM compares this document's own
   * hierarchy rather than a mockup of someone else's. The long timeout is
   * load-bearing: the engine launches a browser per render and the axios
   * default would kill it.
   */
  previewToc: async (cycleId: string, design: string): Promise<TocPreview> => {
    const { data } = await apiClient.post(
      `/pm/cycles/${encodeURIComponent(cycleId)}/toc-preview`,
      { design },
      { timeout: 120000 },
    )
    return data
  },
}

/**
 * Download the report, typeset by the shared export engine.
 *
 * Long timeout on purpose: typesetting launches a fresh browser per section, so
 * a 17-section report is around twenty cold starts. The client default of 30s
 * failed every real report while looking like a network fault.
 */
export async function downloadAnnualReport(
  cycleId: string, format: "pdf" | "docx",
): Promise<{ blob: Blob; filename: string }> {
  const res = await apiClient.post(
    `/pm/cycles/${encodeURIComponent(cycleId)}/render`,
    null,
    { params: { format }, responseType: "blob", timeout: 180000 },
  )
  const disposition = String(res.headers?.["content-disposition"] ?? "")
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)
  return {
    blob: res.data as Blob,
    filename: match ? decodeURIComponent(match[1]) : `Annual_Report.${format}`,
  }
}
