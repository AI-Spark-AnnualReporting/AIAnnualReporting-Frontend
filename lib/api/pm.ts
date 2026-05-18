import apiClient from "./client"
import { Session, KickoffBriefResponse, PMReviewAction, SessionStatus } from "@/types"

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

  // Submit a text-based kickoff brief to generate AI questions for all sessions
  submitKickoff: async (payload: KickoffBriefPayload): Promise<KickoffBriefResponse> => {
    const { data } = await apiClient.post<KickoffBriefResponse>("/pm/kickoff", payload)
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
      timeout: 120000, // 2 min — backend extracts + vectorises the kickoff document
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
}
