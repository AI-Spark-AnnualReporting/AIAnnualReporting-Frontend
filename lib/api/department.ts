import apiClient from "./client"
import { DepartmentDashboard, Session, SessionOutline } from "@/types"

export interface SubmitAnswersPayload {
  answers: {
    question_id: string
    question: string
    answer: string
  }[]
}

export interface FinalizePayload {
  final_content: string
}

export interface AiAssistPayload {
  question_id: string
  question: string
  context?: string
}

export interface AdjustTonePayload {
  content: string
  target_tone: string
}

// Flexible refine endpoint — rephrase, expand, restructure, or add content.
export interface AiAssistMessagePayload {
  message: string
  question_id: string
  include_documents?: boolean
}

export interface ConversationPromptPayload {
  question_id: string
  question: string
  current_answer: string
  prompt: string
}

export interface ExtractedAnswer {
  question_id: string
  question: string
  extracted_answer: string
  // "found" = freshly extracted this run, "already_answered" = preserved from a
  // previous run/edit, "not_found" = no supporting document covered it.
  status: "found" | "not_found" | "already_answered"
}

export interface ExtractAnswersResponse {
  success: boolean
  session_id: string
  department: string
  extracted_answers: ExtractedAnswer[]
  total_questions: number
  found_count: number
  not_found_count: number
  message: string
}

// GET .../outline → the outline (null until generated) plus whether it can
// still be edited. `editable` tracks session status: true until the report is
// submitted. Generating a draft does NOT lock the outline.
export interface GetOutlineResponse {
  outline: SessionOutline | null
  editable: boolean
}

// PUT .../draft body — the full draft text. Empty string is meaningful (the
// user cleared the editor), so it must be sent, not skipped.
export interface SaveDraftPayload {
  content: string
}

export interface SaveDraftResponse {
  success: boolean
  saved_at: string
}

// PATCH .../outline body — rename one or more titles by id (headings or
// subheadings). We PATCH a single id per blur, so `titles` usually has one entry.
export interface PatchOutlineTitlesPayload {
  titles: { id: string; title: string }[]
}

export const departmentApi = {
  dashboard: async (): Promise<DepartmentDashboard> => {
    const { data } = await apiClient.get("/department/dashboard")
    return data
  },

  getSession: async (sessionId: string): Promise<{ success: boolean; session: Session }> => {
    const { data } = await apiClient.get(`/department/sessions/${sessionId}`)
    return data
  },

  submitAnswers: async (sessionId: string, payload: SubmitAnswersPayload) => {
    const { data } = await apiClient.post(
      `/department/sessions/${sessionId}/answers`,
      payload
    )
    return data
  },

  generateDraft: async (sessionId: string) => {
    const { data } = await apiClient.post(
      `/department/sessions/${sessionId}/generate-draft`,
      undefined,
      { timeout: 300000 } // 5 min — LLM writes the full draft; the 30s default cancels it
    )
    return data
  },

  finalize: async (sessionId: string, payload: FinalizePayload) => {
    const { data } = await apiClient.post(
      `/department/sessions/${sessionId}/finalize`,
      payload
    )
    return data
  },

  // Persist the user's working draft. PUT (not PATCH) because it fully replaces
  // the text — a retried debounced auto-save is idempotent and can't compound.
  // 409 { detail: "session_locked" } once the session is submitted.
  saveDraft: async (
    sessionId: string,
    payload: SaveDraftPayload
  ): Promise<SaveDraftResponse> => {
    const { data } = await apiClient.put(
      `/department/sessions/${sessionId}/draft`,
      payload
    )
    return data
  },

  // Fetch the current outline + editability. Returns { outline, editable };
  // `outline` is null until Generate Outline is run.
  getOutline: async (sessionId: string): Promise<GetOutlineResponse> => {
    const { data } = await apiClient.get(
      `/department/sessions/${sessionId}/outline`
    )
    return data
  },

  // Build (or rebuild) the outline from the session's answers. LLM call —
  // raise the timeout like extractAnswers/generateDraft so it isn't cut off.
  generateOutline: async (sessionId: string): Promise<{ outline: SessionOutline; step: string }> => {
    const { data } = await apiClient.post(
      `/department/sessions/${sessionId}/generate-outline`,
      undefined,
      { timeout: 120000 } // 2 min — LLM builds the outline
    )
    return data
  },

  // Rename one (or more) heading/subheading titles by id. Returns the full outline.
  patchOutlineTitles: async (
    sessionId: string,
    payload: PatchOutlineTitlesPayload
  ): Promise<SessionOutline> => {
    const { data } = await apiClient.patch(
      `/department/sessions/${sessionId}/outline`,
      payload
    )
    // Backend returns the full outline; tolerate a { outline } wrapper too.
    return data?.outline ?? data
  },

  uploadDocument: async (sessionId: string, file: File) => {
    const formData = new FormData()
    formData.append("file", file)
    // Must delete the instance-level "Content-Type: application/json" default so axios can
    // auto-set "multipart/form-data; boundary=..." from the FormData object.
    // Also raise timeout — backend performs text extraction + vector chunking which can take >30s.
    const { data } = await apiClient.post(
      `/department/sessions/${sessionId}/upload-document`,
      formData,
      {
        headers: { "Content-Type": undefined },
        timeout: 120000, // 2 min — allows time for text extraction + vectorisation
      }
    )
    return data
  },

  // Run AI answer-extraction over the session's uploaded documents — drafts an
  // answer for every question. Slow: the backend reads each document and writes
  // a per-question answer, so allow a generous timeout.
  extractAnswers: async (sessionId: string): Promise<ExtractAnswersResponse> => {
    const { data } = await apiClient.post(
      `/department/sessions/${sessionId}/extract-answers`,
      undefined,
      { timeout: 300000 } // 5 min — AI drafts an answer for each question
    )
    return data
  },

  getAiSuggestion: async (sessionId: string, questionId: string) => {
    const { data } = await apiClient.get(
      `/department/sessions/${sessionId}/questions/${questionId}/suggestion`
    )
    return data
  },

  suggestAnswer: async (sessionId: string, payload: AiAssistPayload) => {
    const { data } = await apiClient.post(
      `/department/sessions/${sessionId}/suggest-answer`,
      payload
    )
    return data
  },

  conversationPrompt: async (sessionId: string, payload: ConversationPromptPayload) => {
    const { data } = await apiClient.post(
      `/department/sessions/${sessionId}/conversation`,
      payload
    )
    return data
  },

  adjustTone: async (sessionId: string, payload: AdjustTonePayload) => {
    const { data } = await apiClient.post(
      `/department/sessions/${sessionId}/adjust-tone`,
      payload
    )
    return data
  },

  // Flexible AI refine — rephrase / expand / restructure / add content.
  // Stateless: returns the rewritten text, does not persist it.
  aiAssist: async (sessionId: string, payload: AiAssistMessagePayload) => {
    const { data } = await apiClient.post(
      `/department/sessions/${sessionId}/ai-assist`,
      payload
    )
    return data
  },

  // Download the session's questions as a PDF. The backend regenerates the file
  // on every call (not stored), so the response is a binary stream.
  downloadQuestions: async (sessionId: string): Promise<{ blob: Blob; filename: string }> => {
    const response = await apiClient.get(
      `/department/sessions/${sessionId}/questions/download`,
      { responseType: "blob" }
    )
    const disposition = response.headers["content-disposition"] as string | undefined
    const filename =
      disposition?.match(/filename="?([^"]+)"?/)?.[1] ?? "Questions.pdf"
    return { blob: response.data, filename }
  },
}
