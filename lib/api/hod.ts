import apiClient from "./client"

// ── HOD (Head of Department) curation API ──────────────────────────────────

export type ReviewStatus = "pending" | "approved" | "rejected"

export interface HODQuestion {
  question_id: string
  question: string
  order: number
  review_status?: ReviewStatus | null
}

export interface HODAnswer {
  question_id: string
  question?: string
  answer?: string
  ai_suggestion?: string | null
  extraction_status?: string | null
}

export interface HODSession {
  session_id: string
  cycle_id: string
  department_id: string
  status: string
  questions: HODQuestion[]
  rejected_questions?: HODQuestion[] | null
  answers?: HODAnswer[] | null
  progress_percentage?: number | null
  review_notes?: string | null
  submitted_at?: string | null
  hod_user_id?: string | null
  user_id?: string | null
  departments?: { department_name?: string; department_code?: string } | null
  reporting_cycles?: {
    cycle_name?: string
    fiscal_year?: number
    submission_deadline?: string
    status?: string
    content_language?: string
  } | null
  users?: { full_name?: string; email?: string } | null
}

export interface AssignableUser {
  user_id: string
  full_name?: string | null
  title?: string | null
  email?: string | null
}

export const hodApi = {
  listSessions: async (status?: string): Promise<HODSession[]> => {
    const { data } = await apiClient.get("/hod/sessions", {
      params: status ? { status } : undefined,
    })
    return data.sessions ?? []
  },

  getSession: async (sessionId: string): Promise<HODSession> => {
    const { data } = await apiClient.get(`/hod/sessions/${sessionId}`)
    return data.session
  },

  reviewQuestion: async (
    sessionId: string,
    questionId: string,
    body: { review_status?: ReviewStatus; text?: string },
  ): Promise<HODSession> => {
    const { data } = await apiClient.put(`/hod/sessions/${sessionId}/questions/${questionId}`, body)
    return data.session
  },

  addQuestion: async (sessionId: string, text: string): Promise<HODSession> => {
    const { data } = await apiClient.post(`/hod/sessions/${sessionId}/questions`, { text })
    return data.session
  },

  removeQuestion: async (sessionId: string, questionId: string): Promise<HODSession> => {
    const { data } = await apiClient.delete(`/hod/sessions/${sessionId}/questions/${questionId}`)
    return data.session
  },

  approveAll: async (sessionId: string): Promise<HODSession> => {
    const { data } = await apiClient.post(`/hod/sessions/${sessionId}/questions/approve-all`)
    return data.session
  },

  assignableUsers: async (sessionId: string): Promise<AssignableUser[]> => {
    const { data } = await apiClient.get(`/hod/sessions/${sessionId}/assignable-users`)
    return data.users ?? []
  },

  assign: async (
    sessionId: string,
    body: { user_id: string; note?: string },
  ): Promise<HODSession> => {
    const { data } = await apiClient.post(`/hod/sessions/${sessionId}/assign`, body)
    return data.session
  },

  reviewAnswers: async (
    sessionId: string,
    body: { action: "approved" | "reopened"; review_notes?: string },
  ): Promise<HODSession> => {
    const { data } = await apiClient.post(`/hod/sessions/${sessionId}/review`, body)
    return data.session
  },
}
