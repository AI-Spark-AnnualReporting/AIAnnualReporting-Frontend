/**
 * The page designer's API surface.
 *
 * Three calls: structure one section, read the whole cycle back, record a
 * choice (one page at a time, or every page at once in landscape).
 * Extraction is per section rather than one batch call so the client can fan
 * out and count completions — the progress on the loading screen is real for
 * that reason.
 */
import type { Orientation } from "@/lib/orientation"
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

/** The sheet a custom template was designed for. It prints only on that one. */
export type CustomPaper = "portrait" | "landscape" | "presentation"

/**
 * A page layout an AI designer wrote for this one section.
 *
 * Only ever saved after the engine filled it with the section's real content
 * and checked the printed result, so a stored one is known to fit.
 */
export interface CustomTemplate {
  html: string
  css: string
  notes: string
  paper: CustomPaper
  /** The art director's brief it was built from; `summary_for_pm` is for people. */
  brief: { summary_for_pm?: string; cannot_do?: string[]; [k: string]: unknown }
  /** What the PM typed, or "" when they let the designer choose. */
  instructions: string
  model: string
  /** How many checks it took to pass (1 = first try). */
  rounds: number
  /** "sheets": fixed sheet designs the content is dealt into; "flow": one flowing page. */
  mode?: "flow" | "sheets"
  /** Each of the PM's wishes and whether the printed result met it. */
  requirements?: { wish: string; met: boolean }[]
  /** The wishes this design does not meet, in plain words (empty when all are met). */
  unmet?: string[]
  /** Wishes the reviewer never answered (it did not respond), so they were not checked. */
  unchecked?: string[]
  /** The approved sketch version it was built from, when it was built from one. */
  sketch_version?: number
  /** The reviewer's one-line verdict on how well it matches the request. */
  review_summary?: string
  /** True after the section was re-extracted: it may no longer fit. */
  needs_recheck: boolean
  created_at: string
}

/** Progress of a custom template run, read from the server's memory. */
export interface CustomTemplateStatus {
  status: "idle" | "running" | "done" | "failed"
  /**
   * The run's ticket. Progress lives in one server process's memory, and
   * another process may still remember an OLDER run of this section; the
   * screen only believes "done" or "failed" for the ticket it is following.
   */
  run_id?: string
  step?: "queued" | "brief" | "build" | "check" | "judge" | "fix" | "explain"
  round?: number
  message?: string
  ok?: boolean
  brief?: CustomTemplate["brief"]
  /** On failure: what went wrong, in plain words. */
  summary?: string
  /** After a save: the wishes the design still misses, in plain words. */
  unmet?: string[]
  wishes_met?: number
  wishes_total?: number
  review_summary?: string
  problems?: { code: string; message: string; where?: string }[]
  started_at?: number
  finished_at?: number
}

/** One box of a layout sketch, from the sketch's fixed menu. */
export interface SketchBox {
  role: "text" | "image" | "figures" | "quotes" | "colour"
  shape: "rectangle" | "rounded" | "circle" | "diamond" | "triangle" | "arch" | "hexagon" | "slanted"
  /** Only a colour block has a colour; every other box says "none". */
  colour: "brand" | "second" | "light" | "none"
  /** % of the page, from the side where reading starts (the right in Arabic). */
  x: number
  /** % of the page, from the top. */
  y: number
  w: number
  h: number
  /** Text columns (text boxes only; 1 otherwise). */
  columns: number
  /** How many figures or quotes a spot holds (0 for other boxes). */
  holds: number
}

/** One page layout of a sketch: the opening page, a body layout (A, B, C) or the end page. */
export interface SketchLayout {
  /** "opener", "A", "B", "C" or "end". */
  id: string
  kind: "opener" | "body" | "end"
  /** One sentence for the PM: what sits where. */
  summary: string
  /** Empty on the end page, which flows. */
  boxes: SketchBox[]
}

/** A quick layout sketch a PM shapes before a custom template is built from it. */
export interface CustomSketch {
  concept: string
  layouts: SketchLayout[]
  cannot_do: string[]
}

/** The notes that asked for a version: one per layout (by id), plus one for all pages. */
export interface SketchNotes {
  layouts: Record<string, string>
  all_pages: string
}

export interface SketchVersion {
  version: number
  /** The ticket of the run that made it; the status route finds it by this. */
  run_id: string
  /** The PM's request it was sketched from. */
  request: string
  sketch: CustomSketch
  /** The notes that produced it (null for a first sketch). */
  notes: SketchNotes | null
  /** The version those notes were written on. */
  based_on: number | null
  /** The designer's answer to each note, under the name the note was written under. */
  replies: { layout: string; reply: string }[]
  created_at: string
}

/** The layout sketches of one section for one sheet: its newest few versions. */
export interface CustomSketchRecord {
  paper: CustomPaper
  language: string
  /** [width, height] of the printed sheet in pt. */
  page_pt: [number, number]
  /** The strip on every side that carries the running header and footer (pt). */
  safe_inset_pt: number
  /** The report's brand colours, with the engine's own fallbacks. */
  colours: { brand: string; second: string; light: string }
  versions: SketchVersion[]
}

/** Where a sketch run has got to, looked up by its ticket. */
export interface CustomSketchStatus {
  /** "done" comes from the database; "unknown" means another server process has it. */
  status: "done" | "running" | "failed" | "unknown"
  version?: number
  /** On "done": the section's envelope, to patch the screen's data with. */
  design?: DesignEnvelope
  message?: string
  /** On "failed": what went wrong, in plain words. */
  summary?: string
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
  /**
   * The LANDSCAPE pick for this page, kept separate from the portrait one
   * above so switching orientation and back finds both still there. Only a
   * person sets it — the art director never picks landscape. Absent on pages
   * extracted before landscape existed, which reads the same as null.
   * Read it through `pickedKey()` rather than directly.
   */
  landscape_template_key?: string | null
  /** When the landscape pick was made. Absent or null when there is none. */
  landscape_chosen_at?: string | null
  /** True when the art director chose this template and nobody has overridden it. */
  template_auto?: boolean
  /** The portrait custom template, when one was made. Picked as "custom". */
  custom_template?: CustomTemplate | null
  /** The landscape (A4 or 16:9) custom template, when one was made. */
  landscape_custom_template?: CustomTemplate | null
  /** The portrait layout sketch, while the PM shapes one before it is built. */
  custom_sketch?: CustomSketchRecord | null
  /** The landscape (A4 or 16:9) layout sketch. */
  landscape_custom_sketch?: CustomSketchRecord | null
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
  /**
   * Everything the screen needs, in one call. Writes nothing.
   *
   * The long timeout is the whole screen's. This reads the assembled report
   * and every section's stored envelope — measured at 1.7s warm and 9.5s on a
   * cold connection for a twelve-section cycle, before anything else the
   * backend is doing gets in the way. At the client default it was the first
   * call to die under load, and its failure is the one that replaces the
   * designer with an error page, so it is the one that must not be cut off
   * while the answer is still coming.
   */
  get: async (cycleId: string): Promise<CycleDesign> => {
    const { data } = await apiClient.get(
      `/pm/cycles/${encodeURIComponent(cycleId)}/create-design`,
      { timeout: 120000 },
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

  /**
   * Start structuring one section in the background.
   *
   * Answers straight away (202); the work carries on on the server and the
   * caller polls `get` until the section reads as extracted. The "Designing
   * your report pages" screen uses this: holding one long request open per
   * section meant a request cut off in the browser lost the screen while the
   * server finished the section anyway. `already_running` means this server
   * was already structuring it (a refresh mid-run) and nothing new started.
   */
  startExtract: async (
    cycleId: string,
    sectionCode: string,
    force = false,
  ): Promise<{ status: "running"; section_code: string; already_running: boolean }> => {
    const params = force ? "background=true&force=true" : "background=true"
    const { data } = await apiClient.post(
      `/pm/cycles/${encodeURIComponent(cycleId)}/sections/${encodeURIComponent(
        sectionCode,
      )}/create-design-extract?${params}`,
    )
    return data
  },

  /**
   * Record the template chosen for one page. `null` clears it.
   *
   * `orientation` says WHICH pick this is: portrait writes `template_key`,
   * landscape writes `landscape_template_key` and leaves the portrait pick
   * alone. The backend refuses a portrait key sent as landscape and vice versa.
   *
   * Small, but it is a read-modify-write of the section's whole envelope and
   * it is fired by a card click while the pre-warm is drawing pages. Giving it
   * room is the difference between a slow save and a lost choice.
   */
  setTemplate: async (
    cycleId: string,
    sectionCode: string,
    unitIndex: number,
    templateKey: string | null,
    orientation: Orientation = "portrait",
  ): Promise<{ section_code: string; design: DesignEnvelope }> => {
    const { data } = await apiClient.put(
      `/pm/cycles/${encodeURIComponent(cycleId)}/sections/${encodeURIComponent(
        sectionCode,
      )}/create-design-template`,
      { unit_index: unitIndex, template_key: templateKey, orientation },
      { timeout: 60000 },
    )
    return data
  },

  /**
   * Start designing a custom page template for one section. Answers at once;
   * the run takes a few minutes on the server — poll `customTemplateStatus`.
   *
   * With `sketchVersion` it is built from that approved layout sketch instead
   * of from the instructions.
   *
   * @returns already_running true when this section was already being designed,
   *   and the ticket of the run to follow
   */
  startCustomTemplate: async (
    cycleId: string,
    sectionCode: string,
    paper: CustomPaper,
    instructions: string,
    sketchVersion?: number,
  ): Promise<{ already_running: boolean; run_id: string | null }> => {
    const body: Record<string, unknown> = { paper, instructions }
    if (sketchVersion !== undefined) body.sketch_version = sketchVersion
    const { data } = await apiClient.post(
      `/pm/cycles/${encodeURIComponent(cycleId)}/sections/${encodeURIComponent(
        sectionCode,
      )}/create-design-custom-template`,
      body,
      { timeout: 60000 },
    )
    return { already_running: Boolean(data?.already_running), run_id: data?.run_id ?? null }
  },

  /** Where the latest custom template run for this section and sheet has got to. */
  customTemplateStatus: async (
    cycleId: string,
    sectionCode: string,
    paper: CustomPaper,
  ): Promise<CustomTemplateStatus> => {
    const { data } = await apiClient.get(
      `/pm/cycles/${encodeURIComponent(cycleId)}/sections/${encodeURIComponent(
        sectionCode,
      )}/create-design-custom-template/status`,
      { params: { paper }, timeout: 30000 },
    )
    return data
  },

  /**
   * Check a saved custom template against the section's current content.
   * No AI call — one render on the server.
   */
  recheckCustomTemplate: async (
    cycleId: string,
    sectionCode: string,
    paper: CustomPaper,
  ): Promise<{
    ok: boolean
    problems: { code: string; message: string; where?: string }[]
    design: DesignEnvelope
  }> => {
    const { data } = await apiClient.post(
      `/pm/cycles/${encodeURIComponent(cycleId)}/sections/${encodeURIComponent(
        sectionCode,
      )}/create-design-custom-template/recheck`,
      { paper },
      { timeout: 120000 },
    )
    return data
  },

  /**
   * Start a quick layout sketch of one section. Answers at once with a ticket;
   * the sketch takes a minute or two on the server — poll `customSketchStatus`.
   */
  startCustomSketch: async (
    cycleId: string,
    sectionCode: string,
    paper: CustomPaper,
    instructions: string,
  ): Promise<{ run_id: string }> => {
    const { data } = await apiClient.post(
      `/pm/cycles/${encodeURIComponent(cycleId)}/sections/${encodeURIComponent(
        sectionCode,
      )}/create-design-custom-sketch`,
      { paper, instructions },
      { timeout: 60000 },
    )
    return { run_id: String(data?.run_id ?? "") }
  },

  /** Start the next version of a sketch from the PM's notes. Answers at once with a ticket. */
  updateCustomSketch: async (
    cycleId: string,
    sectionCode: string,
    paper: CustomPaper,
    version: number,
    notes: SketchNotes,
  ): Promise<{ run_id: string }> => {
    const { data } = await apiClient.post(
      `/pm/cycles/${encodeURIComponent(cycleId)}/sections/${encodeURIComponent(
        sectionCode,
      )}/create-design-custom-sketch/update`,
      { paper, version, notes: notes.layouts, all_pages: notes.all_pages },
      { timeout: 60000 },
    )
    return { run_id: String(data?.run_id ?? "") }
  },

  /** Where the sketch run with this ticket has got to. */
  customSketchStatus: async (
    cycleId: string,
    sectionCode: string,
    paper: CustomPaper,
    runId: string,
  ): Promise<CustomSketchStatus> => {
    const { data } = await apiClient.get(
      `/pm/cycles/${encodeURIComponent(cycleId)}/sections/${encodeURIComponent(
        sectionCode,
      )}/create-design-custom-sketch/status`,
      { params: { paper, run_id: runId }, timeout: 30000 },
    )
    return data
  },

  /**
   * "Use for all sections" in landscape: give every page with no landscape
   * pick yet this landscape template, in one request.
   *
   * Pages that already have a landscape pick are left alone, and portrait
   * picks are never touched. Comes back with every section it changed, keyed
   * by section code, so the screen can patch them in without a refetch.
   *
   * Same timeout as setTemplate and for the same reason, only more so: it is
   * that read-modify-write once per section, fired while the pre-warm is busy.
   *
   * @returns how many pages were filled, and each changed section's envelope
   */
  applyLandscapeToAll: async (
    cycleId: string,
    templateKey: string,
  ): Promise<{ applied: number; sections: Record<string, DesignEnvelope> }> => {
    const { data } = await apiClient.post(
      `/pm/cycles/${encodeURIComponent(cycleId)}/create-design-landscape-all`,
      { template_key: templateKey },
      { timeout: 60000 },
    )
    return { applied: data?.applied ?? 0, sections: data?.sections ?? {} }
  },
}
