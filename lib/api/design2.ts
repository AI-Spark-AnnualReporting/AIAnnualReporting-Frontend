/**
 * The page designer's API surface.
 *
 * Three calls: structure one section, read the whole cycle back, record a
 * choice. Extraction is per section rather than one batch call so the client
 * can fan out and count completions — the progress on the loading screen is
 * real for that reason.
 */
import type { DesignBlocksResult } from "./designBlocks"
import { apiClient } from "./client"

/** What one template would do with a unit's blocks. */
export interface DesignOption {
  key: string
  recommended: boolean
  reason: string | null
  counts: { stat?: number; para?: number; table?: number; lede?: number }
  dropped: {
    narrative_blocks?: number
    numeric_data?: number
    tables?: number
    pull_quotes?: number
  }
}

/** One page of a section. */
export interface DesignUnit {
  index: number
  total: number
  title: string
  chars: number
  body_sha256: string
  blocks: DesignBlocksResult
  options: DesignOption[]
  options_error?: string
  template_key: string | null
  chosen_at: string | null
}

export interface DesignEnvelope {
  v: number
  source: {
    sha256: string
    chars: number
    extracted_at: string
    model: string
    language: string
  }
  units: DesignUnit[]
}

export interface DesignSection {
  section_code: string
  title: string
  order: number
  eligible: boolean
  ineligible_reason: string | null
  extracted: boolean
  stale: boolean
  design: DesignEnvelope | null
}

export interface CycleDesign {
  cycle_id: string
  sections: DesignSection[]
  units_total: number
  units_chosen: number
}

export const design2Api = {
  /** Everything the screen needs, in one call. Writes nothing. */
  get: async (cycleId: string): Promise<CycleDesign> => {
    const { data } = await apiClient.get(
      `/pm/cycles/${encodeURIComponent(cycleId)}/design2`,
    )
    return data
  },

  /**
   * Structure one section into pages.
   *
   * Idempotent unless `force`: a section whose content has not changed since
   * it was last structured comes back from the database and costs nothing,
   * which is what makes re-entering the designer free. The long timeout is
   * load-bearing — this runs one model call per page and the axios default
   * would kill it.
   */
  extract: async (
    cycleId: string,
    sectionCode: string,
    force = false,
  ): Promise<{ section_code: string; design: DesignEnvelope }> => {
    const { data } = await apiClient.post(
      `/pm/cycles/${encodeURIComponent(cycleId)}/sections/${encodeURIComponent(
        sectionCode,
      )}/design2-extract${force ? "?force=true" : ""}`,
      undefined,
      { timeout: 180000 },
    )
    return data
  },

  /** Record the template chosen for one page. `null` clears it. */
  setTemplate: async (
    cycleId: string,
    sectionCode: string,
    unitIndex: number,
    templateKey: string | null,
  ): Promise<{ section_code: string; design: DesignEnvelope }> => {
    const { data } = await apiClient.put(
      `/pm/cycles/${encodeURIComponent(cycleId)}/sections/${encodeURIComponent(
        sectionCode,
      )}/design2-template`,
      { unit_index: unitIndex, template_key: templateKey },
    )
    return data
  },
}
