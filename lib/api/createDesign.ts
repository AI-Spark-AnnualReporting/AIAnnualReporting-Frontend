/**
 * The page designer's API surface.
 *
 * Three calls: structure one section, read the whole cycle back, record a
 * choice. Extraction is per section rather than one batch call so the client
 * can fan out and count completions — the progress on the loading screen is
 * real for that reason.
 */
import type { SectionBlocks } from "./sectionBlocks"
import { apiClient } from "./client"

/** What one template would do with a unit's blocks. */
export interface DesignOption {
  key: string
  recommended: boolean
  reason: string | null
  counts: {
    stat?: number
    para?: number
    table?: number
    lede?: number
    quote?: number
  }
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
  blocks: SectionBlocks
  options: DesignOption[]
  options_error?: string
  template_key: string | null
  chosen_at: string | null
  /** True when the art director chose this template and nobody has overridden it. */
  template_auto?: boolean
  /** block id -> the emphasis the art director gave it. */
  roles?: Record<string, string>
  /**
   * Positions, per source array, of blocks that should open a fresh sheet.
   *
   * Positions and not block ids: the renderer has never heard of an id, and
   * the art director's reorder has already moved things by the time a page is
   * drawn — so a hint stored as an id would land on whatever took the old
   * slot. e.g. { "tables": [0], "narrative_blocks": [7] }.
   */
  breaks?: Record<string, number[]>
}

/**
 * The art director's decision for one section.
 *
 * `why` is written for the person reviewing the page, not for a log — it is
 * shown under the recommended template in place of the old count-based
 * reason ("16 figures, only 412 chars of prose"), which explained the rule
 * rather than the judgement.
 */
export interface DesignPlan {
  template_key: string
  why: string
  blocks: number
  ranked: number
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
  plan: DesignPlan | null
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
  plan: DesignPlan | null
  design: DesignEnvelope | null
}

export interface CycleDesign {
  cycle_id: string
  sections: DesignSection[]
  units_total: number
  /** Pages with a template at all — after art direction, normally every one. */
  units_chosen: number
  /** Pages a PERSON has signed off. The only number that measures progress. */
  units_reviewed: number
}

export const createDesignApi = {
  /** Everything the screen needs, in one call. Writes nothing. */
  get: async (cycleId: string): Promise<CycleDesign> => {
    const { data } = await apiClient.get(
      `/pm/cycles/${encodeURIComponent(cycleId)}/create-design`,
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
      )}/create-design-extract${force ? "?force=true" : ""}`,
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
      )}/create-design-template`,
      { unit_index: unitIndex, template_key: templateKey },
    )
    return data
  },
}
