import apiClient from "./client"
import {
  Session, KickoffBriefResponse, PMReviewAction, SessionStatus,
  BuildReadiness, CycleReportSection,
  PlanResponse, ReportTheme, AvailableOptionalSection,
  AssemblyReadiness, FinalReport, SectionMode,
  ContentLanguage,
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

// Previous kickoff brief lookup — resolved server-side from the most recent
// OTHER cycle of the same company that has a non-empty brief (highest fiscal
// year, then newest). Used to pre-fill the strategic-brief textarea.
export interface PreviousBriefResponse {
  has_previous: boolean
  kickoff_brief: string | null
  source_cycle_id: string | null
  source_cycle_name: string | null
  source_fiscal_year: number | null
}

// Previous manual sections lookup — pre-fill source for the human-voice
// (manual) sections of the report builder. Company-scoped: resolved from this
// company's most recent prior cycle that had each section filled. `source`
// tells the UI where the content came from and is the only field to branch on.
export type PreviousManualSource =
  | "previous_cycle"
  | "company_description"
  | "none"

export interface PreviousManualSection {
  section_code: string
  section_number: number
  title: string
  mode: string // always "manual"
  has_data: boolean
  content: string | null
  source: PreviousManualSource
  source_cycle_id: string | null
  fiscal_year: number | null
}

export interface PreviousManualSectionsResponse {
  success: boolean
  company_id: string
  sections: PreviousManualSection[]
}

// GET /pm/cycles/{id}/survey-questions — the questionnaire feeding the
// Strategic Brief wizard. Order is stable per cycle (safe to index by
// position for a stepper). `options: null` means a plain free-text question;
// `options: string[]` (up to 6) means chip-select. EVERY string is a real answer
// to render — the generator prompt forbids an "Other" entry and never appended
// one, so nothing may be sliced off the array. The "Other…" box under the options
// is a frontend affordance, not an API value. `source` is informational only
// (template vs AI-generated) — don't group or branch on it.
//
// COUNT AND SHAPE ARE NOT FIXED. Current cycles return 12 questions (9 template
// + 3 generated, server-shuffled), older ones return 10 — never hardcode either.
// Nothing may branch on the `t*`/`g*` id: whether a question is free text is
// `options` being null/empty, and whether it renders as pills or stacked rows is
// the length of its option strings. t7 used to carry options and now doesn't;
// t3/t4 options are now full sentences. Both must keep rendering on old cycles.
export interface SurveyQuestion {
  id: string
  text: string
  source: "template" | "generated"
  options: string[] | null
}

export interface SurveyQuestionsResponse {
  success: boolean
  cycle_id: string
  total: number
  questions: SurveyQuestion[]
}

// POST /pm/cycles/{id}/generate-brief — Strategic Brief wizard Step 2.
// One entry per ANSWERED question only (unanswered ones may be omitted — no
// server-side required-count check, that gate is frontend-only). question_id
// must be an id from the survey-questions response; unrecognized ids are
// silently dropped server-side. For a multi-select chip question, join every
// selected option (plus any free text) into one comma-separated string.
export interface GenerateBriefAnswer {
  question_id: string
  answer: string
}

export interface GenerateBriefPayload {
  answers: GenerateBriefAnswer[]
}

// An "area of focus" replaces the old BriefTheme: what was the theme `title` is
// now the marketing `slogan`, and the `keywords` chips are now `sub_slogans`.
// The old `selected` boolean is gone — `role` carries it, with "none" meaning
// not selected.
//
// `summary` is one AI-written sentence describing what the area reflects ("" when
// never generated). It is WRITE-SENSITIVE: save-brief-and-areas-of-focus and
// areas-of-focus/refine overwrite the stored list wholesale and default summary
// to "" server-side, so an area sent without it loses its summary. Always spread
// the existing object (`{ ...area, slogan }`) instead of rebuilding it field by
// field. A manual slogan/sub-slogan edit keeps the old summary — no AI runs on a
// plain save; refine regenerates it.
//
// The shape and the save rule live in lib/areasOfFocus.ts (no imports, so the
// rule can be run directly against its self-check) and are re-exported here so
// callers keep importing everything PM-related from one place.
import type { AreaOfFocus } from "@/lib/areasOfFocus"

export type { AreaRole, AreaOfFocus } from "@/lib/areasOfFocus"
export {
  MIN_SELECTED_AREAS,
  MAX_SELECTED_AREAS,
  roleSelectionSaveable,
} from "@/lib/areasOfFocus"

// Suggested themes are a DIFFERENT cycle column (`suggested_themes`) on a
// different screen, and deliberately stay on the older title/keywords/selected
// shape — the areas-of-focus rename does not apply to them.
export interface SuggestedTheme {
  title: string
  keywords: string[]
  selected?: boolean
}

// A success response with an empty strategic_brief is a SOFT FAILURE (the LLM
// step failed server-side) — treat it like an error, not an empty result.
export interface GenerateBriefResponse {
  success: boolean
  cycle_id: string
  strategic_brief: string
  // Generation returns 5 areas, all with role "none" — the PM picks before
  // anything can be saved.
  areas_of_focus: AreaOfFocus[]
  // NEW — description-based themes, stored server-side on the cycle.
  suggested_themes?: SuggestedTheme[]
}

// POST /pm/cycles/{id}/brief-document — optional supporting doc for the brief.
// One doc per cycle (each upload REPLACES the previous), stored only — no AI,
// no brief returned. generate-brief later reads whatever doc is on the cycle.
export interface BriefDocument {
  document_id: string
  filename: string
  document_purpose?: string
  file_size?: number
  word_count?: number
}

export interface UploadBriefDocumentResponse {
  success: boolean
  cycle_id: string
  documents_uploaded: number
  documents: BriefDocument[]
  message?: string
}

// POST /pm/cycles/{id}/brief/refine and /areas-of-focus/refine — the "Refine with AI"
// assistants. Send the CURRENT on-screen content + a free-text instruction; the
// LLM returns the complete revised version (already saved server-side). If it
// couldn't apply the instruction it returns the input unchanged (still 200).
export interface RefineBriefPayload {
  strategic_brief: string
  instruction: string
}
export interface RefineBriefResponse {
  success: boolean
  cycle_id: string
  strategic_brief: string
}
// Refine deliberately has NO selection validation — the PM can reword slogans
// before choosing a primary. It also preserves the primary pick server-side, so
// never re-apply roles from the response on the client.
export interface RefineAreasOfFocusPayload {
  areas_of_focus: AreaOfFocus[]
  instruction: string
}
export interface RefineAreasOfFocusResponse {
  success: boolean
  cycle_id: string
  areas_of_focus: AreaOfFocus[]
}
// Concept messages — one per area of focus, the brand copy behind each slogan.
// `area_slogan` names the area a message was written from, and `role` marks the
// one that leads. Both are optional: messages stored before those fields shipped
// don't carry them, and a message the PM adds by hand has no area at all. Order
// still backs up `role` (generation returns them primary-area-first) and survives
// because every write sends the whole list.
//
// Every endpoint returns the WHOLE list and every write takes the WHOLE list —
// a partial array overwrites what's stored. generate and refine SAVE their
// result server-side, so don't follow them with a save call.
//
// Generation failures come back as 200 with an EMPTY list, not an error status,
// so callers must check `concept_messages.length` rather than trusting the code.
export type ConceptRole = "primary" | "secondary"

export interface ConceptMessage {
  /** A two-word phrase the agent reads off the copy it just wrote — NOT the
   *  area's slogan, which it used to be. Never match it against the areas list;
   *  `area_slogan` is the link. */
  title: string
  /** First-person brand copy, not an explanation: three paragraphs of 100–120
   *  words separated by blank lines. Split on \n\n and render as separate <p>s
   *  — as one block it's a ~350-word wall. Edit it in a textarea. */
  description: string
  /**
   * Exactly one message per cycle is "primary". OPTIONAL — messages written
   * before the field shipped don't carry it, so read it when present and fall
   * back to position when absent; see primaryIndexOf on the concept-messages
   * screen. Position is still written alongside it on every save.
   */
  role?: ConceptRole
  /**
   * The slogan of the area of focus this message was written from. Read-only
   * label — editing it here changes nothing, the areas own their slogans.
   * Absent on messages the PM adds by hand and on pre-existing ones. Preserve
   * it on writes (spread the message) or the link back to the area is lost.
   */
  area_slogan?: string
}

export interface ConceptMessagesResponse {
  success: boolean
  cycle_id: string
  concept_messages: ConceptMessage[]
}

export interface RefineConceptMessagesPayload {
  concept_messages: ConceptMessage[]
  instruction: string
}

// POST /pm/cycles/{id}/suggested-themes/refine — the "Refine with AI" assistant
// for the description-based suggested themes. Send the live list + instruction;
// returns the COMPLETE revised set (already saved server-side).
export interface RefineSuggestedThemesPayload {
  suggested_themes: SuggestedTheme[]
  instruction: string
}
export interface RefineSuggestedThemesResponse {
  success: boolean
  cycle_id: string
  suggested_themes: SuggestedTheme[]
}

// PUT /pm/cycles/{id}/save-brief-and-areas-of-focus — persists the PM's MANUAL
// edits (brief text, area add/delete, slogan + sub-slogan edits, role changes).
// Partial: send only the changed field(s). Omitted/null = leave as-is; a present
// value replaces it; empty string/array clears it. `areas_of_focus` must be the
// WHOLE current list, not a patch, and must pass `roleSelectionSaveable` or the
// server answers 422. The response is always the full resulting state.
export interface SaveBriefAndAreasPayload {
  strategic_brief?: string
  areas_of_focus?: AreaOfFocus[]
  // NEW — send the WHOLE suggested_themes list; omitted = left as-is.
  suggested_themes?: SuggestedTheme[]
}
export interface SaveBriefAndAreasResponse {
  success: boolean
  cycle_id: string
  strategic_brief: string
  areas_of_focus: AreaOfFocus[]
  suggested_themes: SuggestedTheme[]
}

// The subset of cycle fields the brief wizard needs to detect a
// previously-generated (persisted) brief on reload, without re-calling the AI.
export interface CycleBriefFields {
  cycle_name?: string
  fiscal_year?: number
  kickoff_brief?: string | null
  areas_of_focus?: AreaOfFocus[] | null
  suggested_themes?: SuggestedTheme[] | null
  questions_deadline?: string | null
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
  // Last-modified timestamp from CycleResponse/TimestampMixin — drives the "Last Modified" sort.
  updated_at?: string
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

  // Fetch the previous kickoff brief to pre-fill the strategic-brief field.
  // Tenant- and ownership-scoped server-side: a PM only ever gets a brief from
  // their own company's cycles. has_previous=false (first cycle) is normal.
  previousBrief: async (cycleId: string): Promise<PreviousBriefResponse> => {
    const { data } = await apiClient.get<PreviousBriefResponse>(
      `/pm/cycles/${cycleId}/previous-brief`,
    )
    return data
  },

  // Fetch the company's previous manual-section content to pre-fill the
  // human-voice sections in the report builder. Company-scoped: the companyId
  // comes from the authenticated user (/auth/me). A PM may only pass their own
  // companyId (403 otherwise); admins may pass any. Read-only suggestions — the
  // PM still edits and saves each section via saveManualContent.
  //
  // contentLanguage is the language of the report being created (the cycle's
  // content_language). The backend returns only previous content authored in
  // cycles of that language — an English report is never pre-filled with Arabic
  // content (and vice versa). Must be exactly "english"/"arabic" (the enum);
  // anything else → 422. Omitting it falls back to latest content of any
  // language, so always send it. When the company has no previous content in the
  // requested language, sections come back with has_data:false / source:"none"
  // (the about_company fallback to the company description is language-neutral).
  previousManualSections: async (
    companyId: string,
    contentLanguage?: ContentLanguage,
  ): Promise<PreviousManualSectionsResponse> => {
    const { data } = await apiClient.get<PreviousManualSectionsResponse>(
      `/pm/companies/${companyId}/manual-sections/previous`,
      contentLanguage
        ? { params: { content_language: contentLanguage } }
        : undefined,
    )
    return data
  },

  // Fetch the questionnaire that drives the Strategic Brief wizard's Step 1.
  // 403 → PM doesn't own this cycle; 404 → cycle not found (also returned for
  // cross-tenant access — treat both the same as "not found"). 200 with
  // total:0 means the question set hasn't been generated yet (not an error).
  getSurveyQuestions: async (cycleId: string): Promise<SurveyQuestionsResponse> => {
    const { data } = await apiClient.get<SurveyQuestionsResponse>(
      `/pm/cycles/${cycleId}/survey-questions`,
    )
    return data
  },

  // Strategic Brief wizard Step 2 — one synchronous call, no job id/polling.
  // 2-3 sequential LLM calls server-side with no output token cap, so this can
  // run well past the "typical" case — generous timeout to match the other
  // multi-LLM-call endpoints in this file (buildPlan, assembleReport, etc.).
  generateBrief: async (
    cycleId: string,
    payload: GenerateBriefPayload,
  ): Promise<GenerateBriefResponse> => {
    const { data } = await apiClient.post<GenerateBriefResponse>(
      `/pm/cycles/${cycleId}/generate-brief`,
      payload,
      { timeout: 120000 },
    )
    return data
  },

  // Persist manual (non-AI) edits to the brief/areas of focus. Partial payload;
  // the response is the full resulting state. Fast DB write, no AI. Sending an
  // `areas_of_focus` list that fails `roleSelectionSaveable` returns 422.
  saveBriefAndAreas: async (
    cycleId: string,
    payload: SaveBriefAndAreasPayload,
  ): Promise<SaveBriefAndAreasResponse> => {
    const { data } = await apiClient.put<SaveBriefAndAreasResponse>(
      `/pm/cycles/${cycleId}/save-brief-and-areas-of-focus`,
      payload,
    )
    return data
  },

  // "Refine with AI" — Strategic Brief. Send the live textarea content + a
  // free-text instruction; returns the complete revised brief (already saved).
  refineBrief: async (
    cycleId: string,
    payload: RefineBriefPayload,
  ): Promise<RefineBriefResponse> => {
    const { data } = await apiClient.post<RefineBriefResponse>(
      `/pm/cycles/${cycleId}/brief/refine`,
      payload,
      { timeout: 60000 },
    )
    return data
  },

  // "Refine with AI" — Areas of Focus. Send the live list + instruction; returns
  // the COMPLETE revised set (may add/remove/reword) — overwrite the whole list.
  // No selection validation here by design, and the server keeps the existing
  // primary pick, so the response's roles are authoritative.
  refineAreasOfFocus: async (
    cycleId: string,
    payload: RefineAreasOfFocusPayload,
  ): Promise<RefineAreasOfFocusResponse> => {
    const { data } = await apiClient.post<RefineAreasOfFocusResponse>(
      `/pm/cycles/${cycleId}/areas-of-focus/refine`,
      payload,
      { timeout: 60000 },
    )
    return data
  },

  // ── Concept messages ──────────────────────────────────────────────────────
  // Read whatever is stored. Empty list = not generated yet.
  getConceptMessages: async (cycleId: string): Promise<ConceptMessagesResponse> => {
    const { data } = await apiClient.get<ConceptMessagesResponse>(
      `/pm/cycles/${cycleId}/concept-messages`,
    )
    return data
  },

  // Write one message per area of focus, from the areas already on the cycle.
  // No request body. Slow (LLM) and ALREADY SAVED on return.
  generateConceptMessages: async (cycleId: string): Promise<ConceptMessagesResponse> => {
    const { data } = await apiClient.post<ConceptMessagesResponse>(
      `/pm/cycles/${cycleId}/concept-messages/generate`,
      undefined,
      { timeout: 120000 },
    )
    return data
  },

  // "Refine with AI" — concept messages. Send the live list + instruction;
  // returns the COMPLETE revised set, already saved server-side.
  refineConceptMessages: async (
    cycleId: string,
    payload: RefineConceptMessagesPayload,
  ): Promise<ConceptMessagesResponse> => {
    const { data } = await apiClient.post<ConceptMessagesResponse>(
      `/pm/cycles/${cycleId}/concept-messages/refine`,
      payload,
      { timeout: 120000 },
    )
    return data
  },

  // Persist manual edits. Send the WHOLE list — this replaces what's stored.
  saveConceptMessages: async (
    cycleId: string,
    concept_messages: ConceptMessage[],
  ): Promise<ConceptMessagesResponse> => {
    const { data } = await apiClient.put<ConceptMessagesResponse>(
      `/pm/cycles/${cycleId}/concept-messages`,
      { concept_messages },
    )
    return data
  },

  // "Refine with AI" — Suggested (description-based) themes. Send the live list
  // + instruction; returns the COMPLETE revised set (already saved server-side).
  refineSuggestedThemes: async (
    cycleId: string,
    payload: RefineSuggestedThemesPayload,
  ): Promise<RefineSuggestedThemesResponse> => {
    const { data } = await apiClient.post<RefineSuggestedThemesResponse>(
      `/pm/cycles/${cycleId}/suggested-themes/refine`,
      payload,
      { timeout: 60000 },
    )
    return data
  },

  // Upload an optional supporting document for the strategic brief. Multipart,
  // field name MUST be "file". Content-Type is deleted so axios sets the
  // multipart boundary itself. Replaces any prior brief doc on the cycle.
  uploadBriefDocument: async (
    cycleId: string,
    file: File,
  ): Promise<UploadBriefDocumentResponse> => {
    const form = new FormData()
    form.append("file", file)
    const { data } = await apiClient.post<UploadBriefDocumentResponse>(
      `/pm/cycles/${cycleId}/brief-document`,
      form,
      { headers: { "Content-Type": undefined }, timeout: 120000 },
    )
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

  // Set or clear the questions deadline for a cycle.
  // Pass null to clear. Returns the updated cycle + notified_count.
  setQuestionsDeadline: async (
    cycleId: string,
    deadline: string | null,
  ): Promise<{ message: string; cycle_id: string; questions_deadline: string | null; notified_count: number }> => {
    const { data } = await apiClient.put(`/pm/cycles/${cycleId}/questions-deadline`, {
      questions_deadline: deadline,
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

  // Extract-mode: override the AI-extracted text. The source document stays
  // attached — only the content body is updated. Pass "" to clear it.
  setExtractContent: async (
    cycleId: string,
    sectionCode: string,
    content: string,
  ): Promise<CycleReportSection> => {
    const { data } = await apiClient.put<{ success: boolean; section: CycleReportSection }>(
      `/pm/cycles/${cycleId}/sections/${sectionCode}/extract-content`,
      { content },
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

  // Analyze-mode: trigger (or re-trigger) the analyze agent for a section.
  // The backend reads feeder department digests and writes structured Markdown
  // findings into section.content. Long timeout — LLM call over N digests.
  runAnalysis: async (
    cycleId: string,
    sectionCode: string,
  ): Promise<CycleReportSection> => {
    const { data } = await apiClient.post<{ success: boolean; section: CycleReportSection }>(
      `/pm/cycles/${cycleId}/sections/${sectionCode}/analyze`,
      undefined,
      { timeout: 120000 },
    )
    return data.section
  },

  // Analyze-mode: override or clear the AI findings. Pass "" or null to clear
  // (backend stores as null). Mirrors the existing extract-content endpoint.
  setAnalyzeContent: async (
    cycleId: string,
    sectionCode: string,
    content: string | null,
  ): Promise<CycleReportSection> => {
    const { data } = await apiClient.put<{ success: boolean; section: CycleReportSection }>(
      `/pm/cycles/${cycleId}/sections/${sectionCode}/analyze-content`,
      { content },
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

  // Manual sections (ai_allowed = false): the PM types content directly. No
  // LLM, no department source. Saves overwrite the previous body.
  saveManualContent: async (
    cycleId: string,
    sectionCode: string,
    content: string,
  ): Promise<CycleReportSection> => {
    const { data } = await apiClient.put<{ success: boolean; section: CycleReportSection }>(
      `/pm/cycles/${cycleId}/sections/${sectionCode}/manual-content`,
      { content },
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

  // One-way lock that freezes the plan blueprint. No request body, no unlock.
  // Returns the full plan with `sections_locked: true`.
  lockPlan: async (cycleId: string): Promise<PlanResponse> => {
    const { data } = await apiClient.post(`/pm/cycles/${cycleId}/plan/lock`)
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

  // Switch a section's source type. generate → extract clears feeders + content;
  // extract → generate deletes the document, content, and feeders. Returns the
  // updated section (its `mode` is the single source of truth afterwards).
  setSourceMode: async (
    cycleId: string,
    sectionCode: string,
    mode: SectionMode,
  ): Promise<CycleReportSection> => {
    const { data } = await apiClient.put<{ success: boolean; section: CycleReportSection }>(
      `/pm/cycles/${cycleId}/sections/${sectionCode}/source-mode`,
      { mode },
    )
    return data.section
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
