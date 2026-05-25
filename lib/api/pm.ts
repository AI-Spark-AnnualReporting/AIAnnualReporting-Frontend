import apiClient from "./client"
import {
  Session, KickoffBriefResponse, PMReviewAction, SessionStatus,
  BuildReadiness, CycleReportSection,
  PlanResponse, ReportTheme, AvailableOptionalSection,
  AssemblyReadiness, FinalReport,
} from "@/types"

export interface ReviewPayload {
  action: PMReviewAction
  review_notes?: string
}

export interface ReminderPayload {
  user_ids: string[]
  title: string
  message: string
  priority?: "low" | "normal" | "high" | "urgent"
  related_type?: string
  related_id?: string
  action_url?: string
}

export interface EscalationPayload {
  session_id: string
  reason: string
  priority?: string
}

export interface GenerateReportPayload {
  // If session_ids is omitted, the backend includes ALL approved sessions
  session_ids?: string[]
  format?: "markdown" | "html" | "text"
}

// PM kickoff brief — submitted after cycle is active
export interface KickoffBriefPayload {
  cycle_id: string
  strategic_brief: string
  additional_context?: string
  // Optional — backend default is 12, accepted range 5-20
  num_questions?: number
}

// PM-access cycle + session list shapes (real backend endpoints)
export interface PMCycleListItem {
  cycle_id: string
  cycle_name: string
  fiscal_year: number
  status: string
  submission_deadline?: string
}

export interface PMCycleSession {
  session_id: string
  department_id: string
  department_name: string
  department_code: string
  user_id: string
  user_name: string
  status: SessionStatus
  progress_percentage: number
  submitted_at: string | null
}

export const pmApi = {
  /**
   * Fetch PM cycle dashboard directly from the backend.
   * The previous departments:[] backend bug has been fixed — we now get full
   * cycle metadata + per-status stats + an array of department session summaries
   * straight from GET /pm/dashboard/{cycle_id}.
   */
  cycleDashboard: async (cycleId: string) => {
    const { data } = await apiClient.get(`/pm/dashboard/${cycleId}`)
    return data
  },

  // Submit a text-based kickoff brief to generate AI questions for all sessions.
  // This runs an AI question-generation pipeline for every department, so it needs
  // a long timeout — the 30s client default would abort mid-generation and tempt
  // the PM to resubmit, firing a DUPLICATE kickoff.
  submitKickoff: async (payload: KickoffBriefPayload): Promise<KickoffBriefResponse> => {
    const { data } = await apiClient.post<KickoffBriefResponse>("/pm/kickoff", payload, {
      timeout: 180000, // 3 min — AI generates questions for every department
    })
    return data
  },

  // Upload a document as the kickoff brief (alternative to text)
  // The backend requires strategic_brief even when uploading a doc (used as a summary/context hint).
  // Field name MUST be "files" — the FastAPI handler is typed `files: List[UploadFile]`.
  uploadKickoffDoc: async (
    file: File,
    cycleId: string,
    strategicBrief?: string,
    numQuestions?: number,
  ): Promise<KickoffBriefResponse> => {
    const formData = new FormData()
    formData.append("files", file)
    formData.append("cycle_id", cycleId)
    formData.append("strategic_brief", strategicBrief || "Please refer to the attached document for strategic context.")
    if (typeof numQuestions === "number") {
      formData.append("num_questions", String(numQuestions))
    }
    // Must delete the instance-level "Content-Type: application/json" default so axios can
    // auto-set "multipart/form-data; boundary=..." from the FormData object.
    const { data } = await apiClient.post<KickoffBriefResponse>("/pm/kickoff/upload", formData, {
      headers: { "Content-Type": undefined },
      timeout: 180000, // 3 min — backend extracts + vectorises the doc AND generates questions
    })
    return data
  },

  // GET /pm/cycles — the cycles assigned to this PM.
  // The cycle id field name varies by backend shape (cycle_id vs id / _id),
  // so normalise it to a guaranteed `cycle_id` for downstream callers.
  getCycles: async (): Promise<{ success: boolean; cycles: PMCycleListItem[]; total: number }> => {
    const { data } = await apiClient.get("/pm/cycles")
    const raw = (data?.cycles ?? []) as Array<Record<string, unknown>>
    const cycles: PMCycleListItem[] = raw.map((c) => ({
      ...(c as unknown as PMCycleListItem),
      cycle_id: (c.cycle_id ?? c.id ?? c._id) as string,
    }))
    return { success: data?.success ?? true, cycles, total: data?.total ?? cycles.length }
  },

  // GET /pm/cycles/{id}/sessions — every department session in a cycle
  getCycleSessions: async (
    cycleId: string
  ): Promise<{ success: boolean; sessions: PMCycleSession[]; total: number }> => {
    const { data } = await apiClient.get(`/pm/cycles/${cycleId}/sessions`)
    return data
  },

  /**
   * Fetch a session's full Q&A detail as PM. GET /pm/sessions/{id} is the
   * PM-access endpoint — it works for sessions owned by department users
   * (the /department/sessions/{id} endpoint rejects non-owners).
   */
  getSession: async (sessionId: string): Promise<{ success: boolean; session: Session }> => {
    const { data } = await apiClient.get(`/pm/sessions/${sessionId}`)
    return data
  },

  reviewSession: async (sessionId: string, payload: ReviewPayload) => {
    const { data } = await apiClient.post(
      `/pm/sessions/${sessionId}/review`,
      payload
    )
    return data
  },

  sendBulkReminders: async (payload: ReminderPayload) => {
    const { data } = await apiClient.post("/pm/reminders", payload)
    return data
  },

  createEscalation: async (payload: EscalationPayload) => {
    const { data } = await apiClient.post("/pm/escalations", payload)
    return data
  },

  getEscalations: async (cycleId: string) => {
    const { data } = await apiClient.get(`/pm/escalations/${cycleId}`)
    return data
  },

  generateReport: async (cycleId: string, payload: GenerateReportPayload) => {
    const { data } = await apiClient.post(
      `/pm/cycles/${cycleId}/generate-report`,
      payload
    )
    return data
  },

  // Get a generated report's full content by id (GET /pm/reports/{report_id}).
  getReport: async (reportId: string) => {
    const { data } = await apiClient.get(`/pm/reports/${reportId}`)
    return data
  },

  // Download a previously generated report as a .docx file.
  // `reportId` comes from the generate-report response.
  downloadReportDocx: async (reportId: string): Promise<Blob> => {
    const { data } = await apiClient.get(`/pm/reports/${reportId}/download`, {
      responseType: "blob",
    })
    return data
  },

  // Whether a cycle is ready to enter the Report Builder.
  buildReadiness: async (cycleId: string): Promise<BuildReadiness> => {
    const { data } = await apiClient.get(`/pm/cycles/${cycleId}/build-readiness`)
    return data
  },

  // Resolved report sections for a cycle (PM-access). Named to parallel getCycleSessions.
  getCycleSections: async (cycleId: string): Promise<CycleReportSection[]> => {
    const { data } = await apiClient.get(`/pm/cycles/${cycleId}/sections`)
    return data.sections
  },

  // Attach-mode: upload the source document for a single section.
  // Same multipart pattern as department.uploadDocument — "Content-Type": undefined so axios
  // sets the multipart boundary, and 120s timeout because the backend extracts + chunks the file.
  attachUpload: async (
    cycleId: string,
    sectionCode: string,
    file: File,
  ): Promise<CycleReportSection> => {
    const formData = new FormData()
    formData.append("file", file)
    const { data } = await apiClient.post<{ success: boolean; section: CycleReportSection }>(
      `/pm/cycles/${cycleId}/sections/${sectionCode}/attachment`,
      formData,
      { headers: { "Content-Type": undefined }, timeout: 120000 },
    )
    return data.section
  },

  lockSection: async (
    cycleId: string,
    sectionCode: string,
  ): Promise<CycleReportSection> => {
    const { data } = await apiClient.post<{ success: boolean; section: CycleReportSection }>(
      `/pm/cycles/${cycleId}/sections/${sectionCode}/lock`,
    )
    return data.section
  },

  unlockSection: async (
    cycleId: string,
    sectionCode: string,
  ): Promise<CycleReportSection> => {
    const { data } = await apiClient.post<{ success: boolean; section: CycleReportSection }>(
      `/pm/cycles/${cycleId}/sections/${sectionCode}/unlock`,
    )
    return data.section
  },

  removeAttachment: async (
    cycleId: string,
    sectionCode: string,
  ): Promise<CycleReportSection> => {
    const { data } = await apiClient.delete<{ success: boolean; section: CycleReportSection }>(
      `/pm/cycles/${cycleId}/sections/${sectionCode}/attachment`,
    )
    return data.section
  },

  // Stage 7a — generate the narrative for a section via the LLM.
  // Returns the updated section with content + status:"drafting".
  // Long timeout because the LLM call typically runs 10–40s.
  generateSection: async (
    cycleId: string,
    sectionCode: string,
  ): Promise<CycleReportSection> => {
    const { data } = await apiClient.post<{ success: boolean; section: CycleReportSection }>(
      `/pm/cycles/${cycleId}/sections/${sectionCode}/generate`,
      undefined,
      { timeout: 120000 },
    )
    return data.section
  },

  // Stage 7b — refine an existing draft with a natural-language instruction.
  // Backend takes the current section + the instruction, runs an LLM pass, and
  // returns the wholly-rewritten section. Stateless on the backend: each call
  // stands alone (no transcript), so the latest content IS the persisted state.
  refineSection: async (
    cycleId: string,
    sectionCode: string,
    instruction: string,
  ): Promise<CycleReportSection> => {
    const { data } = await apiClient.post<{ success: boolean; section: CycleReportSection }>(
      `/pm/cycles/${cycleId}/sections/${sectionCode}/refine`,
      { instruction },
      { timeout: 120000 },
    )
    return data.section
  },

  // ───── Stage 6 — Plan Review ─────────────────────────────────────────
  // Backend responses may wrap as { plan: {...} } / { sections: [...] } /
  // { available: [...] } or return the value directly. Tolerate both.

  getPlan: async (cycleId: string): Promise<PlanResponse> => {
    const { data } = await apiClient.get(`/pm/cycles/${cycleId}/plan`)
    return data.plan ?? data
  },

  // refresh=true regenerates and overwrites manual edits.
  buildPlan: async (cycleId: string, refresh = false): Promise<PlanResponse> => {
    const { data } = await apiClient.post(
      `/pm/cycles/${cycleId}/plan${refresh ? "?refresh=true" : ""}`,
      undefined,
      { timeout: 180000 }, // two LLM passes — generous timeout
    )
    return data.plan ?? data
  },

  updatePlan: async (
    cycleId: string,
    payload: { headline?: string | null; themes?: ReportTheme[] },
  ): Promise<PlanResponse> => {
    const { data } = await apiClient.patch(`/pm/cycles/${cycleId}/plan`, payload)
    return data.plan ?? data
  },

  setFeeders: async (
    cycleId: string,
    sectionCode: string,
    departmentCodes: string[],
  ): Promise<PlanResponse> => {
    const { data } = await apiClient.put(
      `/pm/cycles/${cycleId}/sections/${sectionCode}/feeders`,
      { departments: departmentCodes },
    )
    return data.plan ?? data
  },

  reorderSections: async (
    cycleId: string,
    orderedSectionCodes: string[],
  ): Promise<CycleReportSection[]> => {
    const { data } = await apiClient.put(`/pm/cycles/${cycleId}/sections/order`, {
      ordered_codes: orderedSectionCodes,
    })
    return data.sections ?? data
  },

  addOptionalSection: async (
    cycleId: string,
    sectionCode: string,
  ): Promise<CycleReportSection[]> => {
    const { data } = await apiClient.post(
      `/pm/cycles/${cycleId}/sections/optional`,
      { section_code: sectionCode },
    )
    return data.sections ?? data
  },

  // `force=true` lets the PM remove required sections after confirming the
  // warning dialog. Locked sections still 409 either way — caller must unlock
  // first.
  removeOptionalSection: async (
    cycleId: string,
    sectionCode: string,
    force = false,
  ): Promise<CycleReportSection[]> => {
    const { data } = await apiClient.delete(
      `/pm/cycles/${cycleId}/sections/optional/${sectionCode}${force ? "?force=true" : ""}`,
    )
    return data.sections ?? data
  },

  getAvailableOptional: async (
    cycleId: string,
  ): Promise<AvailableOptionalSection[]> => {
    const { data } = await apiClient.get(
      `/pm/cycles/${cycleId}/sections/optional/available`,
    )
    return data.available ?? data
  },

  // ───── Stage 8 — Assemble & Final Report ─────────────────────────────

  assemblyReadiness: async (cycleId: string): Promise<AssemblyReadiness> => {
    const { data } = await apiClient.get(
      `/pm/cycles/${cycleId}/assembly-readiness`,
    )
    return data
  },

  // 120s — backend writes exec summary + assembles. refresh=true regenerates.
  assembleReport: async (
    cycleId: string,
    refresh = false,
  ): Promise<FinalReport> => {
    const { data } = await apiClient.post<
      { success: boolean; report: FinalReport } | FinalReport
    >(
      `/pm/cycles/${cycleId}/assemble${refresh ? "?refresh=true" : ""}`,
      undefined,
      { timeout: 120000 },
    )
    return (data as { report?: FinalReport }).report ?? (data as FinalReport)
  },

  getFinalReport: async (cycleId: string): Promise<FinalReport> => {
    const { data } = await apiClient.get<
      { report: FinalReport } | FinalReport
    >(`/pm/cycles/${cycleId}/final-report`)
    return (data as { report?: FinalReport }).report ?? (data as FinalReport)
  },

  // Stage 9a — render the assembled report to a downloadable file.
  // Backend returns the file as a binary stream with Content-Disposition for
  // the filename. 9a supports docx; pdf returns 501 until 9b ships.
  // CRITICAL: responseType "blob" — without it axios tries to JSON-parse the
  // binary and corrupts the file.
  renderReport: async (
    cycleId: string,
    format: "docx" | "pdf",
  ): Promise<{ blob: Blob; filename: string }> => {
    try {
      const response = await apiClient.post(
        `/pm/cycles/${cycleId}/render?format=${format}`,
        null,
        { responseType: "blob", timeout: 120000 },
      )
      const filename =
        parseContentDispositionFilename(
          response.headers?.["content-disposition"],
        ) ?? `Annual_Report.${format}`
      return { blob: response.data as Blob, filename }
    } catch (err: unknown) {
      // When responseType is "blob", error bodies are also Blobs. Read the
      // blob as text so we can surface the backend's `detail` message in the
      // toast instead of a generic "Request failed".
      const decoded = await decodeBlobError(err)
      if (decoded) throw new Error(decoded)
      throw err
    }
  },
}

// Pull `filename` from a Content-Disposition header. Handles both the legacy
// `filename="..."` form and the UTF-8 form `filename*=UTF-8''<encoded>`.
function parseContentDispositionFilename(header?: string): string | null {
  if (!header) return null
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1].trim())
    } catch {
      // fall through to the standard form
    }
  }
  const match = header.match(/filename="?([^";]+)"?/i)
  return match ? match[1].trim() : null
}

// Read an axios error whose `response.data` is a Blob and pull out the
// FastAPI `{ detail }` string for surfacing in a toast. Returns null if the
// error didn't carry a parseable blob body.
async function decodeBlobError(err: unknown): Promise<string | null> {
  if (!err || typeof err !== "object") return null
  // After the global apiClient interceptor runs, the rejection shape is
  // `{ message, status, details, error }`. When responseType was "blob",
  // `details` ends up being the raw Blob (the interceptor doesn't try to
  // parse it). Look in both possible spots defensively.
  const candidate =
    (err as { details?: unknown }).details ??
    (err as { response?: { data?: unknown } }).response?.data
  if (!(candidate instanceof Blob)) return null
  try {
    const text = await candidate.text()
    const parsed = JSON.parse(text) as {
      detail?: unknown
      message?: unknown
    }
    const detail = parsed.detail ?? parsed.message
    if (typeof detail === "string") return detail
    if (Array.isArray(detail)) {
      const flat = detail
        .map((d) => (d as { msg?: string })?.msg)
        .filter(Boolean)
        .join("; ")
      return flat || null
    }
    return null
  } catch {
    return null
  }
}
